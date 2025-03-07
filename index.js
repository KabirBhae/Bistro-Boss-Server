const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;

//default middlewares
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_User}:${process.env.DB_PASSWORD}@coffee.2a0ov.mongodb.net/?retryWrites=true&w=majority&appName=Coffee`;

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
		await client.connect();

		const dbName = "bistroDB";

		const usersCollection = client.db(dbName).collection("users");
		const menuCollection = client.db(dbName).collection("menu");
		const reviewsCollection = client.db(dbName).collection("reviews");
		const cartsCollection = client.db(dbName).collection("carts");

		app.get("/menu", async (req, res) => {
			const result = await menuCollection.find().toArray();
			res.send(result);
		});

		app.get("/reviews", async (req, res) => {
			const result = await reviewsCollection.find().toArray();
			res.send(result);
		});

		//users related
		app.post("/users", async (req, res) => {
			const user = req.body;
			//checking if user already exists
			const query = { email: user.email };
			const existingUser = await usersCollection.findOne(query);
			if (existingUser) {
				return res.send({ message: "user already exists", insertedId: null });
			}
			//if not, then add the user to DB
			const result = await usersCollection.insertOne(user);
			res.send(result);
		});

		//carts related
		app.get("/carts", async (req, res) => {
			const email = req.query.email;
			const query = { email: email };
			const result = await cartsCollection.find(query).toArray();
			res.send(result);
		});
		app.post("/carts", async (req, res) => {
			const cartItem = req.body;
			const result = await cartsCollection.insertOne(cartItem);
			res.send(result);
		});

		app.delete("/carts/:id", async (req, res) => {
			const cartID = req.params.id;
			const query = { _id: new ObjectId(cartID) };
			const result = await cartsCollection.deleteOne(query);
			res.send(result);
		});

		// Send a ping to confirm a successful connection
		await client.db("admin").command({ ping: 1 });
		console.log("Pinged your deployment. You successfully connected to MongoDB!");
	} finally {
		// Ensures that the client will close when you finish/error
		// await client.close();
	}
}
run().catch(console.dir);

app.listen(port, () => {
	console.log("Server running on port: ", port);
});
