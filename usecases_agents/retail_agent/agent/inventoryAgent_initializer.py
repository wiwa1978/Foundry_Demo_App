from .retail_initializer import initialize_retail_agent


def main():
    return initialize_retail_agent("inventory_agent", "zava-inventory-agent", "InventoryAgentPrompt.txt", "Zava Inventory")


if __name__ == "__main__":
    main()
