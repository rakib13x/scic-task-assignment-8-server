const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// CORS middleware
//middleware
app.use(cookieParser());
// const corsOptions = {
//   origin: "https://shiply-ea44d.web.app", // Replace with your frontend domain
//   credentials: true, // Enable credentials (cookies, authorization headers, etc.)
// };

app.use(cors());
app.use(express.json());

// console.log(process.env.DB_PASS);
// console.log(process.env.DB_User);

app.get("/", (req, res) => {
  res.send("Tasker is Running");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kyfxv.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)

    // Send a ping to confirm a successful connection
    //bistro Database

    const userCollection = client.db("tasksDb").collection("users");
    const taskCollection = client.db("tasksDb").collection("tasks");
    const reviewCollection = client.db("tasksDb").collection("reviews");

    //jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    //middlewares
    const verifyToken = (req, res, next) => {
      console.log("inside verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
      // next();
    };

    //use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //users related api
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      console.log(req.headers);
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      //insert email if user doesn't exists:
      //you can do this many ways (1.email unique ,2.upsert, 3. simple checking)
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    //task related apis

    app.get("/tasks", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await taskCollection.find(query).toArray();
      res.send(result);
      console.log(query);
    });

    app.post("/tasks", async (req, res) => {
      const task = req.body;
      const result = await taskCollection.insertOne(task);
      res.send(result);
    });

    app.put("/tasks/:id", async (req, res) => {
      try {
        const id = req.params.id;
        console.log("Received request for task ID:", id);
        console.log("Request Payload:", req.body);

        // Assuming the new task status is provided in the request body
        const newStatus = req.body.taskStatus;
        console.log(newStatus);

        // Validate that the new status is one of the allowed values
        const allowedStatuses = ["toDo", "ongoing", "completed"];
        if (!allowedStatuses.includes(newStatus)) {
          return res.status(400).json({
            success: false,
            message: "Invalid task status",
          });
        }

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            taskStatus: newStatus,
          },
        };

        const result = await taskCollection.updateOne(filter, updateDoc);
        console.log("Task Result:", result);

        if (result.matchedCount > 0) {
          res.status(200).json({
            success: true,
            message: "Task status updated successfully",
          });
        } else {
          res.status(404).json({
            success: false,
            message: "Task status not found.",
          });
        }
      } catch (error) {
        console.error("Axios Error:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal Server Error" });
      }
    });
    app.put("/tasks/update/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updatedTaskData = req.body; // Assuming the updated task data is sent in the request body

        // Validate and sanitize the updated data if necessary

        const update = {
          $set: updatedTaskData,
        };

        const result = await taskCollection.updateOne(query, update);

        if (result.modifiedCount > 0) {
          res
            .status(200)
            .json({ success: true, message: "Task updated successfully" });
        } else {
          res.status(404).json({
            success: false,
            message: "Task not found or not modified",
          });
        }
      } catch (error) {
        console.error("Error updating task:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal Server Error" });
      }
    });

    app.delete("/tasks/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await taskCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/reviews", async (req, res) => {
      const result = await taskCollection.find(query).toArray();
      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Port is Running at ${port}`);
});
