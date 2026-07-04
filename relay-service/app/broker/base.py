from abc import ABC, abstractmethod
from typing import Callable

from app.broker.types import Holding, OrderRequest, OrderResult, OrderStatus, Session


class BrokerAdapter(ABC):
    """PROJECT_BRIEF.md section 3. All domain logic talks to this interface,
    never to a broker SDK directly, so a second broker can be added without
    touching anything upstream.
    """

    @abstractmethod
    async def login(self, credentials: dict) -> Session: ...

    @abstractmethod
    async def refresh_session(self, session: Session) -> Session: ...

    @abstractmethod
    async def get_holdings(self, session: Session) -> list[Holding]: ...

    @abstractmethod
    async def place_order(self, session: Session, order: OrderRequest) -> OrderResult: ...

    @abstractmethod
    async def get_order_status(self, session: Session, order_id: str) -> OrderStatus: ...

    @abstractmethod
    def subscribe_live_prices(self, session: Session, symbols: list[str], on_tick: Callable) -> None: ...
