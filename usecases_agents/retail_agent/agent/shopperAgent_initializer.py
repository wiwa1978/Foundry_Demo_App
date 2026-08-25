from .retail_initializer import initialize_retail_agent


def main():
    return initialize_retail_agent("cora", "zava-shop-assistant-agent", "ShopperAgentPrompt.txt", "Zava Shopping Assistant")


if __name__ == "__main__":
    main()
