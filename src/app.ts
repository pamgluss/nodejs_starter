import express from "express";
import { Request, Response } from "express";

import dotenv from "dotenv";
import fs from "node:fs/promises";
import sqlite3 from "sqlite3";

import { AggregateUserEvents, DataSchema } from "./types.js";

import axios, {
  AxiosRequestConfig,
  AxiosResponse,
  RawAxiosRequestHeaders,
} from "axios";

import { createEmptyUserEventAggregate } from "./utils.js";

dotenv.config();

if (!process.env.PORT) {
  process.exit(1);
}

const app = express();
// Middleware to parse JSON bodies
app.use(express.json());
const PORT: number = parseInt(process.env.PORT as string, 10);

const JSON_DB_PATH = "./src/data.json";

// So to practice using a "real" db use these routes
import { router } from './sqliteRoutes.js'; // Import the router file
app.use('/sqlite', router); 


// All the remaining app.ts routes are using our fake JSON DB
// Which is still useful practice for reading files and parsing JSON
app.get("/", async (req: Request, res: Response) => {
  res.send("Hi!");
});

app.get("/data/:loanId", async (req: Request, res: Response) => {
  const loanId = req.params.loanId as string;
  const result = {
    ok: true,
    loan: null,
    error: "",
  };

  try {
    const data: string = await fs.readFile(JSON_DB_PATH, "utf-8");
    const dataToDictionary = JSON.parse(data);
    if (dataToDictionary.loans && dataToDictionary.loans[loanId]) {
      result.loan = dataToDictionary.loans[loanId];
    }
  } catch (err: unknown) {
    console.error("Error reading file:", err);
    result.ok = false;
    result.error = `${err}`;
  }

  let returnHTML = "<p> Loading </p>";
  if (result.ok) {
    returnHTML = `
      <div>
      <h1> Loan Status </h1>
      <p> Loan ID: ${loanId}</p>
      <p> Result: ${JSON.stringify(result.loan)} </p>
      </div>
    `;
  } else {
    returnHTML = `
      <div>
      <h1> Error: </h1>
      <p> ${result.error} </p>
      </div>
    `;
  }

  res.send(returnHTML);
});

app.post("/addDispute", async (req: Request, res: Response) => {
  let { disputeId, loanId, state, createdAt } = req.body;
  // would be nice to do key validation here but oh well
  // convert strings to integers:
  disputeId = parseInt(disputeId);
  createdAt = parseInt(createdAt);

  // So the idea here will be that we're given a dispute via req
  // Which should have a loanID that matches a loan in the "db"
  // and an index for which dispute we're talking about (in that way, a dispute may go from open -> closed)
  // a state which is either "open", "closed" or "fraud_investigation"
  // and a createdAt date that is larger than the createdAt date for the previous disputes for that loan
  // Why yes this is my Affirm interview
  // When you add a dispute and verify it is valid, then you must also update the loan state it is for
  // any loan with fraud_investigation disputes will be fraudulent
  // any loan with open disputes that are not closed are considered open
  // any loan with only closed disputes are considered closed
  const result = {
    ok: true,
    updated_loan_status: "",
    did_add_dispute: false,
    error: "",
  };

  try {
    const data = fs
      .readFile(JSON_DB_PATH, "utf-8")
      .then((contents: string) => {
        const dataToDictionary = JSON.parse(contents) as DataSchema;
        // Which should have a loanID that matches a loan in the "db"
        if (!(loanId in dataToDictionary.loans)) {
          result.ok = false;
          result.error = `Loan ${loanId} not found in DB`;
          res.send(result);
        }

        // and an index for which dispute we're talking about (in that way, a dispute may go from open -> closed)
        // a state which is either "open", "closed" or "fraud_investigation"
        let doUpdateLoan = false;
        if (dataToDictionary.disputes.length < parseInt(disputeId)) {
          dataToDictionary.disputes.push({
            loanId,
            state,
            createdAt,
          });
          result.did_add_dispute = true;
          doUpdateLoan = true;
        } else {
          if (createdAt > dataToDictionary.disputes[disputeId].createdAt) {
            dataToDictionary.disputes[disputeId] = {
              loanId,
              state,
              createdAt,
            };
            doUpdateLoan = true;
          }
        }

        if (doUpdateLoan) {
          // If loan if fraudulent then its state wont ever change
          if (
            state === "fraud_investigation" ||
            dataToDictionary.loans[loanId].status === "fraudulent"
          ) {
            dataToDictionary.loans[loanId].status = "fraudulent";
            result.updated_loan_status = "fraudulent";
          } else {
            // if loan state was opened and this dispute closed the last dispute then it should be closed
            // Get only open disputes for this loan:
            const openDisputesForThisLoan = dataToDictionary.disputes.filter(
              (dispute) => {
                return dispute.loanId === loanId && dispute.state === "open";
              },
            );

            if (openDisputesForThisLoan.length > 0) {
              dataToDictionary.loans[loanId].status = "open";
              result.updated_loan_status = "open";
            } else {
              dataToDictionary.loans[loanId].status = "closed";
              result.updated_loan_status = "closed";
            }
          }
        }

        return dataToDictionary;
      })
      .then((dictionary: DataSchema) => {
        // Finally write the changes to the "DB":
        try {
          fs.writeFile(JSON_DB_PATH, JSON.stringify(dictionary));
          res.send(result);
        } catch (error: unknown) {
          result.ok = false;
          result.error = `${error}`;
          res.send(result);
        }
      });
  } catch (error: unknown) {
    result.ok = false;
    result.error = `${error}`;
    res.send(result);
  }
});

/**
 * Test API endpoint: https://fiscaldata.treasury.gov/api-documentation/
 */
app.get("/axios/:fields", async (req: Request, res: Response) => {
  const fields = req.params.fields as string;

  const config: AxiosRequestConfig = {
    headers: {
      Accept: "application/json",
    } as RawAxiosRequestHeaders,
  };

  const queryString: string = `q=fields=${fields}&format=json`;

  const client = axios.create({
    baseURL: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/",
  });

  try {
    const searchResponse: AxiosResponse = await client.get(
      `/v1/accounting/dts/debt_subject_to_limit?${queryString}`,
      config,
    );
    res.send(searchResponse.data);
  } catch (error: unknown) {
    res.send(`ERROR: ${error}`);
  }
});

app.get("/test/promises", async (req: Request, res: Response) => {
  const htmlAnchorRegex =
    /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;

  const websites = [
    "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch",
    "https://sites.pitt.edu/~dash/folktexts.html",
  ];

  const links: string[] = [];

  const responses = await Promise.allSettled(
    websites.map((url) => fetch(url))
  );

  const htmlPromises = responses.map(async (result) => {
    if (result.status === "fulfilled") {
      const html = await result.value.text();

      htmlAnchorRegex.lastIndex = 0; // important if regex is global

      let match: RegExpExecArray | null;
      while ((match = htmlAnchorRegex.exec(html)) !== null) {
        links.push(match[1]);
      }
    } else {
      console.error(result.reason);
    }
  });

  await Promise.all(htmlPromises);

  res.send("I did some stuff... " + links.join(", "));
});


// Write a pure function called aggregateUserEvents(events) that returns an object keyed by userId, where each value contains aggregated statistics for that user.
app.post("/data/aggregateUserEvents", async (req: Request, res: Response) => {
  const resultDictionary: AggregateUserEvents = {};
  try {
    fs.readFile(JSON_DB_PATH, "utf-8").then((contents: string) => {
      const dataToDictionary = JSON.parse(contents) as DataSchema;
      const interactions = dataToDictionary.userInteractions;
      interactions.forEach((interaction) => {
        if (!(interaction.userId in resultDictionary)) {
          resultDictionary[interaction.userId] = {
            totalEvents: 0,
            eventCounts: {
              click: 0,
              view: 0,
              purchase: 0,
            },
            totalPurchaseValue: 0,
            firstEventTimestamp: interaction.timestamp,
            lastEventTimestamp: interaction.timestamp,
          };
        }
        
        resultDictionary[interaction.userId].totalEvents++;
        resultDictionary[interaction.userId].eventCounts[interaction.type]++;

        if (interaction.metadata?.value) {
          resultDictionary[interaction.userId].totalPurchaseValue +=
            interaction.metadata.value;
        }

        if (
          interaction.timestamp >
          resultDictionary[interaction.userId].lastEventTimestamp
        ) {
          resultDictionary[interaction.userId].lastEventTimestamp =
            interaction.timestamp;
        }

        if (
          interaction.timestamp <
          resultDictionary[interaction.userId].firstEventTimestamp
        ) {
          resultDictionary[interaction.userId].firstEventTimestamp =
            interaction.timestamp;
        }
      });

      res.send(resultDictionary);
    });
  } catch (error: unknown) {
    res.send(`ERROR: ${error}`);
  }
});

app.post('/data/v2/aggregateUserEvents', async (req: Request, res: Response) => {
  try{
    // Instead of a for loop where we handle each piece of data individually ChatGPT suggests 2 main things
    // First: Use helper methods to abstract out repetitive logic
    // Second: Use an accumulator to combine data
    // A couple important reminders when combining data
    // Don't forget the spread operator!
    // Don't forget Math.min / Math.max which is more readable than an if statement with > and <
    fs.readFile(JSON_DB_PATH, "utf-8").then((contents: string) => {
          const dataToDictionary = JSON.parse(contents) as DataSchema;
          const interactions = dataToDictionary.userInteractions;
          res.send(interactions.reduce<AggregateUserEvents>((accum, interaction) => {
            const { userId, timestamp, type, metadata } = interaction;
            const existing = accum[userId] ?? createEmptyUserEventAggregate(timestamp);

            const purchaseValue =
              interaction.type === 'purchase' && metadata?.value ? metadata.value : 0;

            return {
              ...accum,
              [userId]: {
                totalEvents: existing.totalEvents + 1,
                eventCounts: {
                  ...existing.eventCounts,
                  [type]: existing.eventCounts[type] + 1
                },
                totalPurchaseValue: existing.totalPurchaseValue + purchaseValue,
                firstEventTimestamp: Math.min(existing.firstEventTimestamp, timestamp),
                lastEventTimestamp: Math.max(existing.lastEventTimestamp, timestamp),
              }
            }
          }, {}));
    });

  } catch(error: unknown) {
    res.send(`ERROR: ${error}`);
  }
});

app.listen(PORT, () => {
  return console.log(`Express is listening at http://localhost:${PORT}`);
});
