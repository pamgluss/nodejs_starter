# NodeJS / TypeScript Starter

Boilerplate for a well-structured NodeJS / TypeScript / MongoDB app project

## Using for the first time

- Rename `.env.sample` to `.env` and replace any values/secrets as needed
- Run `npm install`

# Sources

These are the articles/tutorials I used to learn and inform this setup:

- [Node Best Practices (Heroku)](https://devcenter.heroku.com/articles/node-best-practices)
- [NodeJS and TypeScript Tutorial: Build a CRUD API](https://auth0.com/blog/node-js-and-typescript-tutorial-build-a-crud-api/)
- [How to Use TypeScript with NodeJS](https://www.section.io/engineering-education/how-to-use-typescript-with-nodejs/)

# Sample cURLs

Add a dispute to the JSON "database"

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"disputeId": "5", "loanId": 1, "state": "fraud_investigation", "createdAt": 6 }' \
  http://localhost:3000/addDispute
```

Test AggregateUserEvents:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  http://localhost:3000/data/aggregateUserEvents
```
