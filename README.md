# Twitter Clone
A basic implementation of Twitter using TypeScript, Express, and PostgreSQL.
The goal of this project isn't to make a real replica, but rather to teach myself how a full-stack application works, from local development to real deployment.

The project is being hosted at [https://benosullivan.com/twitterclone](https://benosullivan.com/twitterclone)

## Running Locally
### Prerequisites
- [Node.js 16 or greater](https://nodejs.org/en/)
- [Docker](https://www.docker.com/) (Optional, for running PostgreSQL)

### Installation
1. Clone the repository
2. Install dependencies via `npm i`
3. Adjust values in `docker-compose.yml` as required
4. Copy `.env.example` into `.env` and adjust values as required
5. Run `docker compose up` to start the PostgreSQL container
6. Run `npm run db:migrate` to run the database migrations
7. Run `npm run dev` to start the development server
8. Navigate to `localhost:3000` to view the application

## Running in deployment
The project is deployed similarly to the previous steps, but rather than `npm run dev`, `npm run start` is used, compiling the TypeScript and using `pm2` to keep the process running and automatically restarting if it crashes.