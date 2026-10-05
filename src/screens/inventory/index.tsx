import type { Component } from "react";
import InventoryProductsScreen from "./inventory-products";
import InventoryProductCardScreen from "./inventory-product-card";
import InventoryProductFormScreen from "./inventory-product-form";
import InventoryCategoriesScreen from "./inventory-categories";
import InventoryUnitsScreen from "./inventory-units";
import InventoryWarehousesScreen from "./inventory-warehouses";
import InventoryStocktakeScreen from "./inventory-stocktake";
import InventoryTransfersScreen from "./inventory-transfers";
import InventoryAlertsScreen from "./inventory-alerts";
import InventoryMovementsScreen from "./inventory-movements";

/** شاشات وحدة المخزون — Task 3-a */
export const screens: Record<string, Component> = {
  "inventory-products": InventoryProductsScreen,
  "inventory-product-card": InventoryProductCardScreen,
  "inventory-product-form": InventoryProductFormScreen,
  "inventory-categories": InventoryCategoriesScreen,
  "inventory-units": InventoryUnitsScreen,
  "inventory-warehouses": InventoryWarehousesScreen,
  "inventory-stocktake": InventoryStocktakeScreen,
  "inventory-transfers": InventoryTransfersScreen,
  "inventory-alerts": InventoryAlertsScreen,
  "inventory-movements": InventoryMovementsScreen,
};
