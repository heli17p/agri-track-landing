import { GoogleGenAI } from "@google/genai";

// Re-enabled service using Google GenAI SDK following official guidelines
export const sendMessageToAI = async (message: string) => {
  // Initialize AI client with API key from environment variables exclusively
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Use gemini-3-flash-preview for general support and simple Q&A tasks as per guidelines
  const response = await ai.models.generateContentStream({
    model: 'gemini-3-flash-preview',
    contents: message,
  });
  
  return response;
};
