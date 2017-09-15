FROM node:alpine

MAINTAINER See Chuen Hong

WORKDIR /var/www/html

COPY ./ .

RUN npm install

EXPOSE 80

CMD NODE_ENV=production NODE_CONFIG_DIR=./config/ npm start
