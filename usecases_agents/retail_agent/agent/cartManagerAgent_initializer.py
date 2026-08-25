from .retail_initializer import initialize_retail_agent


def main():
    return initialize_retail_agent("cart_manager", "zava-cart-manager-agent", "CartManagerPrompt.txt", "Zava Cart Manager")


if __name__ == "__main__":
    main()
