import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import { AIAnalysisResult, FileEntry, AIConfig } from "../types";

// Helper to clean JSON response from LLMs that like to add markdown blocks
const cleanJsonResponse = (text: string): string => {
  let clean = text.trim();
  // Remove markdown code blocks
  if (clean.startsWith('```json')) {
    clean = clean.replace(/^```json/, '').replace(/```$/, '');
  } else if (clean.startsWith('```')) {
    clean = clean.replace(/^```/, '').replace(/```$/, '');
  }
  return clean.trim();
};

export const analyzeProjectFiles = async (files: FileEntry[], aiConfig: AIConfig): Promise<AIAnalysisResult> => {
  const { provider, apiKey } = aiConfig;
  
  if (!apiKey) throw new Error("Environment variable API_KEY is missing. The application cannot access AI services.");

  // Filter for critical files to send to LLM to save tokens and time
  const criticalFiles = [
    'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    'requirements.txt', 'Pipfile', 'pyproject.toml',
    'go.mod', 'Gemfile', 'composer.json', 
    'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
    'next.config.js', 'vite.config.ts', 'vite.config.js', 'nuxt.config.ts', 'webpack.config.js',
    'pom.xml', 'build.gradle', 
    'app.json',
    '.env', '.env.example', '.env.template', '.env.local', 'config.js', 'config.ts', 'settings.py'
  ];
  
  const contextFiles = files.filter(f => {
    const fileName = f.path.split('/').pop() || '';
    return criticalFiles.includes(fileName) || fileName.startsWith('.env');
  });
  
  // If no critical files found, take the top 5 text files from root to guess structure
  if (contextFiles.length === 0) {
     const rootFiles = files.filter(f => !f.path.includes('/') && (f.path.endsWith('.js') || f.path.endsWith('.ts') || f.path.endsWith('.py') || f.path.endsWith('.json')));
     contextFiles.push(...rootFiles.slice(0, 5));
  }

  // Load content for these files
  const fileContexts = await Promise.all(contextFiles.map(async (f) => {
    const content = await f.fileObject.text();
    return `File: ${f.path}\nContent:\n${content.substring(0, 4000)}\n---\n`;
  }));

  const systemPrompt = `
    You are an expert DevOps engineer and code analyzer.
    I will provide you with a list of files and contents from a software project.
    
    Your goal is to:
    1. Identify the project name (guess from package.json or folder structure) and stack.
    2. Identify the port the application likely listens on. IF UNCERTAIN, DEFAULT TO 3000 (Node) or 8000 (Python).
    3. Generate a production-ready 'Dockerfile' compatible with Coolify.
    4. List environment variables, BUT STRICTLY CLEANED UP.
    
    CRITICAL INSTRUCTIONS FOR ENV VARS:
    - **NO JUNK VARIABLES**: Do NOT list npm_config_*, npm_package_*, NODE_VERSION, PYTHON_VERSION, TERM, COLOR, HOSTNAME, HOME, PWD, HOST, PORT, CI.
    - **CLEAN LIST**: Only list variables that are actual Application Secrets or Config (e.g. DATABASE_URL, API_KEYS, JWT_SECRET).
    - **MANDATORY LLM VARS**: The user wants this app to be compatible with OpenRouter AND Gemini via env vars.
      - YOU MUST INCLUDE THESE SPECIFIC VARIABLES WITH THESE EXACT DEFAULT VALUES in the 'envVars' list:
         - key: 'LLM_PROVIDER', defaultValue: 'openrouter'
         - key: 'BASE_URL', defaultValue: 'https://openrouter.ai/api/v1'
         - key: 'MODEL_NAME', defaultValue: 'meta-llama/llama-3.1-8b-instruct'
         - key: 'OPENROUTER_API_KEY', defaultValue: ''
         - key: 'GOOGLE_API_KEY', defaultValue: ''

    CRITICAL INSTRUCTIONS FOR DOCKERFILE:
    - Use 'COPY . .' to add files. Do NOT use 'COPY package.json .' specifically unless you are 100% sure of the path.
    - EXPOSE the identified port.
    - HOST BINDING: The application MUST listen on 0.0.0.0, NOT 127.0.0.1.
      - If Node/Next.js/Nuxt: Add 'ENV HOST=0.0.0.0' and ensure start command uses it if necessary.
      - If Python/Flask/FastAPI: Ensure CMD uses --host 0.0.0.0.
    
    - **VITE / REACT / VUE PROJECTS FIX**:
      - If you detect 'vite' in package.json:
      - Do NOT use 'npm run preview' or 'vite preview' as the CMD.
      - INSTEAD: Install 'serve' globally.
      - Example pattern for Vite:
        1. RUN npm install
        2. RUN npm run build
        3. RUN npm install -g serve
        4. CMD ["serve", "-s", "dist", "-l", "3000"] (Replace 'dist' with 'build' if needed).
    
    - If Node.js (Generic):
      - Add 'ENV CI=true' before installing dependencies.
      - CRITICAL FIX: If using an Alpine base image (e.g. node:lts-alpine), you MUST add 'RUN apk add --no-cache git' BEFORE running any git config commands.
      - USE 'npm install' instead of 'npm ci'. 'npm ci' is too strict for generic deployments and often fails with 'exit code 1'.
    
    - For every Environment Variable you identified in step 4, you MUST add an 'ENV KEY="default_value"' line in the Dockerfile. 
    - IMPORTANT: YOU MUST PRE-FILL the default values for LLM_PROVIDER="openrouter", BASE_URL="https://openrouter.ai/api/v1", etc. directly in the Dockerfile ENV instructions.

    Files provided:
    ${fileContexts.join('\n')}
    
    RETURN JSON ONLY. No markdown.
  `;

  let resultJsonStr = "";

  // --- GOOGLE GEMINI STRATEGY ---
  if (provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: systemPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              projectName: { type: Type.STRING },
              stack: { type: Type.STRING },
              dockerfile: { type: Type.STRING },
              explanation: { type: Type.STRING },
              port: { type: Type.INTEGER },
              envVars: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    key: { type: Type.STRING },
                    description: { type: Type.STRING },
                    defaultValue: { type: Type.STRING },
                  }
                }
              }
            },
            required: ['projectName', 'stack', 'dockerfile', 'envVars', 'port']
          }
        }
      });
      resultJsonStr = response.text || "{}";
  } 
  
  // --- OPENROUTER / OPENAI STRATEGY ---
  else {
      const openai = new OpenAI({
          baseURL: aiConfig.baseUrl || "https://openrouter.ai/api/v1",
          apiKey: apiKey,
          dangerouslyAllowBrowser: true // Client-side only app
      });

      const completion = await openai.chat.completions.create({
          model: aiConfig.model || "meta-llama/llama-3.1-8b-instruct",
          messages: [
              { role: "system", content: "You are a JSON-only API. You must return valid JSON matching the schema requested." },
              { role: "user", content: systemPrompt }
          ],
          response_format: { type: "json_object" }
      });
      
      resultJsonStr = completion.choices[0].message.content || "{}";
  }

  // Parse and Return
  try {
      const cleaned = cleanJsonResponse(resultJsonStr);
      return JSON.parse(cleaned) as AIAnalysisResult;
  } catch (e) {
      console.error("Failed to parse AI response:", resultJsonStr);
      throw new Error("AI returned invalid JSON. Please try again.");
  }
};