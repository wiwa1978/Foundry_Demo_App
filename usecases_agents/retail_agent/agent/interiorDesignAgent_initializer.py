from .retail_initializer import initialize_retail_agent


def main():
    return initialize_retail_agent("interior_designer", "zava-interior-designer-agent", "InteriorDesignAgentPrompt.txt", "Zava Interior Design")


if __name__ == "__main__":
    main()
