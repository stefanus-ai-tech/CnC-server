# Use an official Node.js runtime as a parent image
FROM node:18

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package.json package-lock.json ./

# Install dependencies using npm ci for a clean, reproducible install
RUN npm ci --only=production

# Copy the rest of the application code to the working directory
COPY . .

# Expose the desired port (ensure it matches your server configuration)
EXPOSE 3000

# Define the command to run your application
CMD ["node", "index.js"]
