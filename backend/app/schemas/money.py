from decimal import Decimal
from typing import Annotated

from pydantic import Field


MoneyAmount = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
