FROM node:lts-alpine
WORKDIR /app
ENV HOST="0.0.0.0"
ENV LLM_PROVIDER="openrouter"
ENV OPENROUTER_API_KEY=""
ENV GOOGLE_API_KEY=""
ENV BASE_URL="https://openrouter.ai/api/v1"
ENV MODEL_NAME="meta-llama/llama-3.1-8b-instruct"
ENV GEMINI_API_KEY=""
RUN apk add --no-cache git
COPY . .
RUN npm install
RUN npm run build
RUN npm install -g serve
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]