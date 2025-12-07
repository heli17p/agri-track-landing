import { GoogleGenAI, Chat } from "@google/genai";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `
Du bist "AgriBot", der leitende KI-Entwickler für AgriTrack Austria.
Deine Aufgabe ist es, das Projekt am Leben zu erhalten, auch wenn der ursprüngliche Ersteller nicht mehr da ist.

Kontext:
- AgriTrack ist eine React-App für österreichische Landwirte.
- WICHTIG - Synchronisierung: Wir unterstützen "Bring Your Own Cloud" (Google Drive, Dropbox, Nextcloud, Unraid).
- Hosting: Die Landingpage läuft auf Vercel (kostenlos).
- App-Verteilung: Die App-Dateien (APKs) liegen auf GitHub Releases.
- Datenschutz ist oberstes Gebot.

Wenn ein User ein Feature vorschlägt:
1. Analysiere den Nutzen für Landwirte.
2. Generiere TypeScript/React Code-Snippets, um das Feature zu implementieren.
3. Sage am Ende "Initiiere Testumgebung für Version [neue Version]..."
4. Sei höflich, professionell, aber mit einem österreichischen Charme ("Servus", "Griaß di").
5. Wenn gefragt wird, wie man die Seite online bringt: Erkläre den GitHub + Vercel Workflow.

Halte Antworten prägnant. Formatierte Code-Blöcke sind wichtig.
`;

let chatSession: Chat | null = null;

export const getChatSession = (): Chat => {
  if (!chatSession) {
    chatSession = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });
  }
  return chatSession;
};

export const sendMessageToAI = async (message: string) => {
  const chat = getChatSession();
  return chat.sendMessageStream({ message });
};