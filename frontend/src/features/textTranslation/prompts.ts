import type { PromptExample } from "@/components/PromptExamples";

import type { LanguageServiceUseCaseId } from "./types";

type LanguageServicePromptGallery = {
  title: string;
  description: string;
  examples: readonly PromptExample[];
};

export const translationPromptGallery: readonly PromptExample[] = [
  {
    id: "medical-appointment",
    title: "Medical appointment",
    prompt:
      "The doctor is available next Monday. Would you like me to schedule an appointment?",
    description: "Clear, polite healthcare communication.",
    badges: ["Healthcare", "Customer message"],
  },
  {
    id: "customer-reassurance",
    title: "Customer reassurance",
    prompt:
      "I understand that this unexpected change is frustrating. We are working closely with you to find the best possible solution.",
    description: "Empathetic support language with a calm tone.",
    badges: ["Support", "Tone"],
  },
  {
    id: "product-launch",
    title: "Product launch",
    prompt:
      "We are excited to announce that the new service will be available to customers in more than 30 countries starting September 15.",
    description: "Professional announcement with dates and numbers.",
    badges: ["Announcement", "Numbers"],
  },
  {
    id: "legal-notice",
    title: "Legal notice",
    prompt:
      "This agreement may be terminated by either party with thirty days' written notice, subject to the obligations described in section 8.",
    description: "Formal wording where precision matters.",
    badges: ["Legal", "Precision"],
  },
  {
    id: "idiom",
    title: "Idiom",
    prompt: "Let's get the ball rolling before the opportunity passes us by.",
    description: "Natural expression that tests contextual translation.",
    badges: ["Idiomatic", "Context"],
  },
  {
    id: "operational-update",
    title: "Operational update",
    prompt:
      "Everything is operating normally. No action is required at this time, and we will keep you informed if anything changes.",
    description: "Neutral status update with explicit next steps.",
    badges: ["Status", "Business"],
  },
  {
    id: "french-customer-update",
    title: "French customer update",
    prompt:
      "Nous sommes ravis de vous annoncer que le nouveau service sera disponible à partir du 15 septembre.",
    description: "French announcement for automatic source detection.",
    badges: ["French", "Announcement"],
  },
  {
    id: "dutch-meeting-update",
    title: "Dutch meeting update",
    prompt:
      "De vergadering begint om negen uur en duurt ongeveer een uur. Stuur je vooraf nog de agenda?",
    description: "Dutch business message with a natural question.",
    badges: ["Dutch", "Business"],
  },
  {
    id: "german-support-message",
    title: "German support message",
    prompt:
      "Wir verstehen, dass diese unerwartete Änderung frustrierend ist, und arbeiten bereits an einer Lösung.",
    description: "German customer-support wording with a reassuring tone.",
    badges: ["German", "Support"],
  },
  {
    id: "spanish-delivery-request",
    title: "Spanish delivery request",
    prompt:
      "¿Puede confirmar la fecha de entrega y la dirección de envío antes del viernes?",
    description: "Spanish request containing a date and an action.",
    badges: ["Spanish", "Customer message"],
  },
  {
    id: "arabic-welcome",
    title: "Arabic welcome",
    prompt: "مرحباً بكم في مركز الدعم. كيف يمكننا مساعدتكم اليوم؟",
    description: "Arabic right-to-left customer greeting.",
    badges: ["Arabic", "RTL script"],
  },
  {
    id: "japanese-service-update",
    title: "Japanese service update",
    prompt:
      "新しいサービスは9月15日から30か国以上のお客様にご利用いただけます。",
    description: "Japanese product availability announcement.",
    badges: ["Japanese", "Announcement"],
  },
];

const languageDetectionPromptGallery: readonly PromptExample[] = [
  {
    id: "language-detection-french",
    title: "French greeting",
    prompt: "Bonjour, comment allez-vous aujourd'hui ?",
    description: "Short French input for a clear language signal.",
    badges: ["French", "Short text"],
  },
  {
    id: "language-detection-dutch",
    title: "Dutch update",
    prompt: "De vergadering begint om negen uur en duurt ongeveer een uur.",
    description: "Business sentence with a strong Dutch signal.",
    badges: ["Dutch", "Business"],
  },
  {
    id: "language-detection-arabic",
    title: "Arabic welcome",
    prompt: "مرحبا بكم في مركز الدعم. كيف يمكننا مساعدتكم اليوم؟",
    description: "Right-to-left script detection example.",
    badges: ["Arabic", "RTL script"],
  },
  {
    id: "language-detection-spanish",
    title: "Spanish request",
    prompt: "¿Puede confirmar la fecha de entrega y la dirección de envío?",
    description: "Spanish customer request with punctuation cues.",
    badges: ["Spanish", "Customer message"],
  },
  {
    id: "language-detection-short",
    title: "Short phrase",
    prompt: "Guten Morgen",
    description: "Minimal input that tests detection with little context.",
    badges: ["German", "Minimal context"],
  },
];

const piiRedactionPromptGallery: readonly PromptExample[] = [
  {
    id: "pii-customer-contact",
    title: "Customer contact",
    prompt:
      "Please contact Maria Jensen at maria.jensen@example.com or +1 202 555 0147 about order 84721.",
    description: "Name, email, phone number, and order reference.",
    badges: ["Email", "Phone"],
  },
  {
    id: "pii-address",
    title: "Shipping address",
    prompt:
      "Send the replacement device to Alex Morgan at 42 Cedar Avenue, Springfield, and confirm delivery by Friday.",
    description: "Person name and postal address in a support request.",
    badges: ["Name", "Address"],
  },
  {
    id: "pii-financial",
    title: "Payment details",
    prompt:
      "The refund should be sent to the account ending in 4821. The customer reference is CUST-2048-7719.",
    description: "Financial and customer identifiers in operational text.",
    badges: ["Financial", "Identifier"],
  },
  {
    id: "pii-clinical",
    title: "Clinical note",
    prompt:
      "Patient Jordan Lee, born on 14 March 1986, called from 020 7946 0958 to discuss the follow-up appointment.",
    description: "Synthetic clinical note with multiple personal identifiers.",
    badges: ["Healthcare", "Date of birth"],
  },
  {
    id: "pii-conversation",
    title: "Conversation excerpt",
    prompt:
      "Hi Sam, I have updated your profile with the new email sam.taylor@example.org. Can you confirm your postcode?",
    description: "Conversational PII across several entity types.",
    badges: ["Conversation", "Email"],
  },
];

const healthTextPromptGallery: readonly PromptExample[] = [
  {
    id: "health-symptoms",
    title: "Symptoms and duration",
    prompt:
      "The patient reports a persistent dry cough for three weeks, mild chest discomfort, and fatigue that is worse in the evening.",
    description: "Symptoms with duration and progression.",
    badges: ["Symptoms", "Duration"],
  },
  {
    id: "health-medication",
    title: "Medication history",
    prompt:
      "The patient started amoxicillin 500 mg three times daily yesterday and reports nausea after the second dose.",
    description: "Medication, dosage, timing, and an adverse reaction.",
    badges: ["Medication", "Adverse event"],
  },
  {
    id: "health-diagnosis",
    title: "Clinical assessment",
    prompt:
      "Assessment: likely viral upper respiratory infection. Recommend rest, fluids, and follow-up if the fever continues beyond 48 hours.",
    description: "Assessment and care recommendation in one note.",
    badges: ["Assessment", "Recommendation"],
  },
  {
    id: "health-procedure",
    title: "Procedure note",
    prompt:
      "A chest X-ray was performed at 10:30. No acute cardiopulmonary abnormality was identified, and the patient was discharged in stable condition.",
    description: "Procedure, finding, time, and outcome.",
    badges: ["Procedure", "Finding"],
  },
  {
    id: "health-follow-up",
    title: "Follow-up plan",
    prompt:
      "Schedule a follow-up visit in two weeks to review blood pressure readings and adjust treatment if the average remains above the target range.",
    description: "Clinical plan with a timeframe and conditional action.",
    badges: ["Plan", "Timeframe"],
  },
];

export const languageServicePromptGalleries: Record<
  LanguageServiceUseCaseId,
  LanguageServicePromptGallery
> = {
  text_translation: {
    title: "Translation sentence gallery",
    description: "Choose an example to load it into the translation composer.",
    examples: translationPromptGallery,
  },
  language_detection: {
    title: "Language detection gallery",
    description: "Choose an example to load it into the analysis composer.",
    examples: languageDetectionPromptGallery,
  },
  pii_redaction: {
    title: "PII redaction gallery",
    description: "Choose an example to load it into the analysis composer.",
    examples: piiRedactionPromptGallery,
  },
  text_analytics_health: {
    title: "Health text gallery",
    description: "Choose an example to load it into the analysis composer.",
    examples: healthTextPromptGallery,
  },
};
