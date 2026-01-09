FROM node:18-alpine

RUN apk add --no-cache ffmpeg python3 py3-pip \
    && pip3 install -U yt-dlp

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
