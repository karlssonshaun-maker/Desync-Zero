from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime
from enum import Enum


class ChannelName(str, Enum):
    takealot = "takealot"
    amazon = "amazon"
    shopify = "shopify"


class SyncStatus(str, Enum):
    pending = "pending"
    success = "success"
    failed = "failed"
    retrying = "retrying"
    dead_letter = "dead_letter"


class InventoryRecord(BaseModel):
    sku: str
    product_name: str
    total_qty: int
    safety_buffer: int
    available_qty: int
    last_updated: datetime
    version: int

    class Config:
        from_attributes = True


class ChannelMappingRecord(BaseModel):
    id: str
    universal_sku: str
    channel: ChannelName
    channel_sku_id: str
    channel_product_id: Optional[str] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class SyncLogRecord(BaseModel):
    id: str
    universal_sku: str
    channel: str
    trigger_source: str
    qty_before: int
    qty_after: int
    qty_pushed: int
    status: SyncStatus
    http_status_code: Optional[int] = None
    error_message: Optional[str] = None
    retry_count: int
    latency_ms: Optional[int] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ShopifyLineItem(BaseModel):
    sku: Optional[str] = None
    variant_id: Optional[int] = None
    quantity: int
    title: str


class ShopifyOrderWebhook(BaseModel):
    id: int
    order_number: Optional[str] = None
    line_items: List[ShopifyLineItem]
    financial_status: str
    fulfillment_status: Optional[str] = None
    created_at: str


class InventoryUpdateRequest(BaseModel):
    sku: str
    new_total_qty: int = Field(..., ge=0)
    trigger_source: str = "manual"

    @field_validator("sku")
    @classmethod
    def sku_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("SKU cannot be empty")
        return v.strip().upper()


class InventoryCreateRequest(BaseModel):
    sku: str
    product_name: str
    total_qty: int = Field(..., ge=0)
    safety_buffer: int = Field(default=0, ge=0)

    @field_validator("sku")
    @classmethod
    def sku_not_empty(cls, v: str) -> str:
        return v.strip().upper()


class ChannelMappingCreateRequest(BaseModel):
    universal_sku: str
    channel: ChannelName
    channel_sku_id: str
    channel_product_id: Optional[str] = None


class SyncResult(BaseModel):
    sku: str
    channel: str
    success: bool
    qty_pushed: int
    error: Optional[str] = None
    latency_ms: Optional[int] = None


class HealthStatus(BaseModel):
    status: str
    database: str
    redis: str
    version: str
    timestamp: datetime
