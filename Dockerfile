FROM node:latest

# Create directory
RUN mkdir =p /usr/src/nics
WORKDIR /usr/src/nics

# Copy and install bot
COPY package.json /usr/src/nics
RUN npm install

# Copy Bot
COPY . /usr/src/nics

# Start
CMD ["node", "/dist/index.js"]