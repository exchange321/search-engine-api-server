# Accessible Search Engine (API Server)

## Description
Backend Search REST API for AcceSE Web Client

## Status
Baseline

## To-Dos
- [ ] Perform Query Expansion
  - [ ] Get Scores Distribution from client
  - [ ] Expand Query to integrate Scores Distribution

## Completed
- [x] Setup API Server
  - [x] Setup FeathersJS
  - [x] Setup ElasticSearch-JS
- [x] Setup Middleware
  - [x] Create 'Search' Middleware
  - [x] Route to Search Middleware
  - [x] Ping ElasticSearch if no query(q) provided
  - [x] Return 1 Record if no page(p) provided
  - [x] Return 10 Records if page(p) provided
  - [x] Return Filtered Records if excludes(e) provided
