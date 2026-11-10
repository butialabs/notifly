from __future__ import annotations

from abc import ABC, abstractmethod

from app.schemas import FlightQuery, Offer


class ProviderError(Exception):
    """Error while querying the flight provider."""


class FlightProvider(ABC):
    name: str = "base"

    @abstractmethod
    def search(self, query: FlightQuery, currency: str) -> list[Offer]: ...
