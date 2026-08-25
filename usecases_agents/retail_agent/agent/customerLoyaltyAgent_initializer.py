from .retail_initializer import initialize_retail_agent


def main():
    return initialize_retail_agent("customer_loyalty", "zava-customer-loyalty-agent", "CustomerLoyaltyAgentPrompt.txt", "Zava Customer Loyalty")


if __name__ == "__main__":
    main()
