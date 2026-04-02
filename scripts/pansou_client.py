import os
import re
from hashlib import sha1
from typing import Any, Callable, Dict, List, Optional

import requests


class BoundTransferUrl(str):
    def __new__(
        cls,
        url: str,
        *,
        snapshot_id: str,
        link_index: int,
        title: str,
        link_type: str,
    ):
        obj = str.__new__(cls, url)
        obj.snapshot_id = snapshot_id
        obj.link_index = link_index
        obj.title = title
        obj.link_type = link_type
        return obj


class LinkCollection:
    def __init__(self, items: List[Dict[str, Any]]):
        self._items = items
        print("=" * 60)
        print(f"EXTRACT RESULT: {len(items)} links found")
        print("=" * 60)
        print("CRITICAL: You MUST iterate ALL links using links.each(callback)")
        print("FORBIDDEN: Do NOT use links[:N]")
        print("=" * 60)

    def __iter__(self):
        raise ValueError(
            "FORBIDDEN: Direct iteration is not allowed. "
            "Use links.each(callback) instead."
        )

    def __len__(self):
        return len(self._items)

    def __getitem__(self, key):
        if isinstance(key, slice):
            raise ValueError(
                "FORBIDDEN: Slicing is not allowed. You must process all links."
            )
        return self._items[key]

    def each(self, callback: Callable[[int, Dict[str, Any]], None]):
        processed = 0
        for index, item in enumerate(self._items):
            callback(index, item)
            processed += 1

        if processed != len(self._items):
            raise RuntimeError(
                f"Failed to process all links: {processed}/{len(self._items)}"
            )

        print(f"\nSuccessfully processed all {processed} links")

    def to_list(self) -> List[Dict[str, Any]]:
        print("WARNING: to_list() called. Make sure you iterate all items.")
        return self._items.copy()


class LinkSnapshot:
    def __init__(self, items: List[Dict[str, Any]]):
        self._items = tuple(dict(item) for item in items)
        self.snapshot_id = self._compute_snapshot_id(items)

    @staticmethod
    def _compute_snapshot_id(items: List[Dict[str, Any]]) -> str:
        parts = []
        for item in items:
            parts.append(
                "|".join(
                    [
                        str(item.get("type", "")),
                        str(item.get("title", "")),
                        str(item.get("url", "")),
                    ]
                )
            )
        return sha1("\n".join(parts).encode("utf-8")).hexdigest()[:12]

    def __len__(self):
        return len(self._items)

    def __getitem__(self, key):
        if isinstance(key, slice):
            raise ValueError("Slicing is not allowed on LinkSnapshot.")
        return dict(self._items[key])

    def bind_indices(self, indices: List[int]) -> List[BoundTransferUrl]:
        if not isinstance(indices, list) or any(not isinstance(i, int) for i in indices):
            raise TypeError("indices must be a list[int]")

        bound_urls: List[BoundTransferUrl] = []
        for index in indices:
            if index < 0 or index >= len(self._items):
                raise IndexError(f"link index out of range: {index}")
            item = self._items[index]
            bound_urls.append(
                BoundTransferUrl(
                    str(item.get("url", "")),
                    snapshot_id=self.snapshot_id,
                    link_index=index,
                    title=str(item.get("title", "")),
                    link_type=str(item.get("type", "")),
                )
            )
        return bound_urls


class PansouClient:
    def __init__(self, base_url: Optional[str] = None, wait_time: int = 10):
        self.base_url = base_url or os.getenv("PANSOU_BASE_URL")
        if not self.base_url:
            raise ValueError(
                "PANSOU_BASE_URL must be set in environment variables or passed to the constructor."
            )

        self.wait_time = wait_time
        self.session = requests.Session()
        self.session.headers.update(
            {"Content-Type": "application/json", "User-Agent": "clawd-media-track/1.0"}
        )

    def _is_valid_keyword(self, keyword: str) -> bool:
        if re.search(r"[Ss]\d+[Ee]\d+", keyword):
            return False
        if not re.search(r"[\u4e00-\u9fff]", keyword):
            return False
        if re.search(r"第\s*\d+\s*集", keyword):
            return False
        return True

    def search(self, keyword: str) -> Dict[str, Any]:
        warnings = []
        effective_keyword = keyword

        if re.search(r"[Ss]\d+[Ee]\d+", keyword):
            warnings.append("Keyword contains SXXEXX pattern; search with clean title instead.")
            effective_keyword = re.sub(r"[Ss]\d+[Ee]\d+", "", keyword).strip()

        if re.search(r"第\s*\d+\s*集", keyword):
            warnings.append("Keyword contains episode number; remove it and search by title only.")
            effective_keyword = re.sub(r"第\s*\d+\s*集", "", effective_keyword).strip()

        if not re.search(r"[\u4e00-\u9fff]", effective_keyword):
            warnings.append("Keyword does not contain Chinese text; Chinese title usually works better.")

        search_data = {"kw": effective_keyword, "res": "all"}
        response = self.session.post(
            f"{self.base_url}/api/search", json=search_data, timeout=60
        )
        response.raise_for_status()

        result = response.json()
        if result.get("code") != 0:
            return {"115": [], "magnet": []}

        data = result.get("data", {})
        results = data.get("results", [])

        results_115 = []
        magnet_results = []

        for item in results:
            if not item:
                continue

            links = item.get("links") or []
            has_115 = False
            has_magnet = False

            for link in links:
                link_type = link.get("type", "")
                url = link.get("url", "")
                if link_type == "115":
                    has_115 = True
                if url.startswith("magnet:"):
                    has_magnet = True

            if has_115:
                results_115.append(item)
            if has_magnet:
                magnet_results.append(item)

        response_data = {"115": results_115, "magnet": magnet_results}
        if warnings:
            response_data["warnings"] = warnings
            response_data["keyword_used"] = effective_keyword
            response_data["keyword_original"] = keyword
        return response_data

    def _collect_links(
        self, results: List[Dict[str, Any]], link_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        links = []
        seen_urls = set()

        for item in results:
            title = item.get("title", "")
            for link in item.get("links", []):
                current_type = link.get("type", "unknown")
                url = link.get("url", "")

                if link_type and current_type != link_type:
                    continue

                if url in seen_urls:
                    continue
                seen_urls.add(url)

                links.append(
                    {
                        "title": title,
                        "type": current_type,
                        "url": url,
                        "password": link.get("password", ""),
                        "datetime": link.get("datetime", ""),
                        "source": item.get("channel", ""),
                    }
                )

        return links

    def extract_all_links(
        self, results: List[Dict[str, Any]], link_type: Optional[str] = None
    ) -> LinkCollection:
        return LinkCollection(self._collect_links(results, link_type=link_type))

    def extract_link_snapshot(
        self, results: List[Dict[str, Any]], link_type: Optional[str] = None
    ) -> LinkSnapshot:
        return LinkSnapshot(self._collect_links(results, link_type=link_type))
