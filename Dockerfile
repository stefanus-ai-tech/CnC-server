# Use an official Node.js runtime as the base image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to leverage Docker cache
COPY package.json package-lock.json ./

# Install dependencies using npm ci for a clean, reproducible install
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Expose the port your server runs on (adjust if different)
EXPOSE 3000

# Define the command to run your server
CMD ["node", "index.js"]
