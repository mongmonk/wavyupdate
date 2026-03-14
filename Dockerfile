FROM node:20-slim

# Install system dependencies (ffmpeg is often required for WhatsApp media processing)
RUN apt-get update && \
    apt-get install -y ffmpeg git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files (excluding those in .dockerignore)
COPY . .

# Ensure sessions and uploads directories exist
RUN mkdir -p sessions uploads

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start"]
