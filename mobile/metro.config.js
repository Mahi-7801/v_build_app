// Metro config compatible with both Expo Go and the bare React Native build.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
