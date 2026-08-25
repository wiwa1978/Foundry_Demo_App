import type { PromptExample } from "@/components/PromptExamples";

export const hostedAgentPromptGallery: {
  title: string;
  description: string;
  examples: readonly PromptExample[];
} = {
  title: "Azure design question gallery",
  description: "Choose an example to load it into the agent composer.",
  examples: [
    {
      id: "hosted-agent-hub-spoke",
      title: "Hub-and-spoke network",
      prompt:
        "Design a hub-and-spoke virtual network topology in Azure for a company with 5 business units, each needing network isolation but shared access to a central firewall and DNS.",
      description: "Landing zone network topology with shared services.",
      badges: ["Networking", "Landing zone"],
    },
    {
      id: "hosted-agent-aks-multiregion",
      title: "Multi-region AKS",
      prompt:
        "What is the recommended architecture for running a multi-region Azure Kubernetes Service deployment with active-active traffic routing and zero-downtime failover?",
      description: "High-availability AKS across regions.",
      badges: ["AKS", "High availability"],
    },
    {
      id: "hosted-agent-event-driven",
      title: "Event-driven microservices",
      prompt:
        "Propose an event-driven microservices architecture on Azure using Event Hubs, Service Bus, and Azure Functions for an order-processing system that must handle spiky traffic.",
      description: "Serverless, event-driven decoupled services.",
      badges: ["Event-driven", "Serverless"],
    },
    {
      id: "hosted-agent-data-platform",
      title: "Modern data platform",
      prompt:
        "Design a modern data platform on Azure combining Data Lake Storage, Azure Databricks, and Microsoft Fabric for both batch ETL and near real-time analytics.",
      description: "Lakehouse-style analytics platform.",
      badges: ["Data platform", "Analytics"],
    },
    {
      id: "hosted-agent-zero-trust",
      title: "Zero-trust identity",
      prompt:
        "How should I implement a zero-trust security model for an Azure web application, covering Entra ID Conditional Access, Private Endpoints, and managed identities?",
      description: "Zero-trust identity and network isolation.",
      badges: ["Security", "Zero trust"],
    },
    {
      id: "hosted-agent-dr-strategy",
      title: "Disaster recovery strategy",
      prompt:
        "What disaster recovery strategy would you recommend for a mission-critical Azure SQL Database and App Service workload with an RPO of 5 minutes and RTO of 1 hour?",
      description: "RPO/RTO-driven DR architecture.",
      badges: ["Resiliency", "RPO/RTO"],
    },
    {
      id: "hosted-agent-cost-optimization",
      title: "Cost optimization review",
      prompt:
        "Review a typical 3-tier web application on Azure (App Service, Azure SQL, Storage) and suggest cost optimization strategies without sacrificing reliability.",
      description: "Right-sizing and cost governance guidance.",
      badges: ["Cost", "FinOps"],
    },
    {
      id: "hosted-agent-genai-app",
      title: "GenAI application architecture",
      prompt:
        "Design a scalable architecture for a retrieval-augmented generation (RAG) application using Azure AI Foundry, Azure AI Search, and Azure OpenAI models.",
      description: "RAG pattern with Foundry and AI Search.",
      badges: ["GenAI", "RAG"],
    },
  ],
};
