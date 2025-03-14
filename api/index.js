const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
var jwt = require("jsonwebtoken");

const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;

//pyament
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

//default middlewares
app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;

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
		// await client.connect();

		const dbName = "bistroDB";

		const usersCollection = client.db(dbName).collection("users");
		const menuCollection = client.db(dbName).collection("menu");
		const reviewsCollection = client.db(dbName).collection("reviews");
		const cartsCollection = client.db(dbName).collection("carts");
		const paymentCollection = client.db(dbName).collection("payments");

		app.get("/", (req, res) => {
			res.send("Server is running very fast");
		});

		app.get("/reviews", async (req, res) => {
			const result = await reviewsCollection.find().toArray();
			res.send(result);
		});

		// middlewares
		const verifyToken = (req, res, next) => {
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
		};
		// use verify admin after verifyToken
		const verifyAdmin = async (req, res, next) => {
			const email = req.decoded.email;
			const query = { email: email };
			const user = await usersCollection.findOne(query);
			const isAdmin = user?.role === "admin";
			if (!isAdmin) {
				return res.status(403).send({ message: "forbidden access" });
			}
			next();
		};
		// create jwt when login or signup
		app.post("/jwt", async (req, res) => {
			const user = req.body;
			const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "1h" });
			res.send({ token });
		});

		//menu related
		app.get("/menu", async (req, res) => {
			const result = await menuCollection.find().toArray();
			res.send(result);
		});
		app.get("/menu/:id", async (req, res) => {
			const id = req.params.id;
			const query = { _id: new ObjectId(id) };
			const result = await menuCollection.findOne(query);
			res.send(result);
		});
		app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
			const item = req.body;
			const result = await menuCollection.insertOne(item);
			res.send(result);
		});
		app.patch("/menu/:id", async (req, res) => {
			const item = req.body;
			const id = req.params.id;
			const filter = { _id: new ObjectId(id) };
			const updatedDoc = {
				$set: {
					name: item.name,
					category: item.category,
					price: item.price,
					recipe: item.recipe,
					image: item.image,
				},
			};

			const result = await menuCollection.updateOne(filter, updatedDoc);
			res.send(result);
		});

		app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
			const id = req.params.id;
			let query = { _id: new ObjectId(id) };
			let result = await menuCollection.deleteOne(query);

			res.send(result);
		});

		//users related api

		//check whether a user is an admin
		app.get("/users/admin/:email", verifyToken, async (req, res) => {
			const email = req.params.email;

			if (email !== req.decoded.email) {
				return res.status(403).send({ message: "forbidden access" });
			}

			const query = { email: email };
			const user = await usersCollection.findOne(query);
			let admin = false;
			if (user) {
				admin = user?.role === "admin";
			}
			res.send({ admin });
		});
		//only admin can see all users
		app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
			const result = await usersCollection.find().toArray();
			res.send(result);
		});
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
		//update an user to admin role
		app.patch("/users/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
			const id = req.params.id;
			const filter = { _id: new ObjectId(id) };
			const updatedDoc = {
				$set: {
					role: "admin",
				},
			};
			const result = await usersCollection.updateOne(filter, updatedDoc);
			res.send(result);
		});

		app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
			const id = req.params.id;
			const query = { _id: new ObjectId(id) };
			const result = await usersCollection.deleteOne(query);
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

		//payment related

		// uses 'price' sent by client to create a payment intent
		//sends client secret back to the client
		app.post("/create-payment-intent", async (req, res) => {
			const { price } = req.body;
			//need to parseInt and multiply by 100 as required by stripe
			const amount = parseInt(price * 100);

			const paymentIntent = await stripe.paymentIntents.create({
				amount: amount,
				currency: "usd",
				//make sure to use this key:val pair
				payment_method_types: ["card"],
			});

			res.send({ clientSecret: paymentIntent.client_secret });
		});
		//show paument history to client
		app.get("/payments/:email", verifyToken, async (req, res) => {
			const query = { email: req.params.email };
			if (req.params.email !== req.decoded.email) {
				return res.status(403).send({ message: "forbidden access" });
			}
			const result = await paymentCollection.find(query).toArray();
			res.send(result);
		});
		//store payment info in DB
		app.post("/payments", async (req, res) => {
			const updatedMenuItemIds = req.body.menuItemIds.map(id => new ObjectId(id));
			const payment = { ...req.body, menuItemIds: updatedMenuItemIds };
			const paymentResult = await paymentCollection.insertOne(payment);

			// insertion done, now delete each item from the cart
			const query = {
				_id: {
					$in: payment.cartIds.map(id => new ObjectId(id)),
				},
			};
			const deleteResult = await cartsCollection.deleteMany(query);

			res.send({ paymentResult, deleteResult });
		});
		//admin home
		app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
			const users = await usersCollection.estimatedDocumentCount();
			const menuItems = await menuCollection.estimatedDocumentCount();
			const orders = await paymentCollection.estimatedDocumentCount();

			// this is not the best way
			// const payments = await paymentCollection.find().toArray();
			// const revenue = payments.reduce((total, payment) => total + payment.price, 0);

			const result = await paymentCollection
				.aggregate([
					{
						$group: {
							_id: null,
							totalRevenue: {
								$sum: "$price",
							},
						},
					},
				])
				.toArray();

			const revenue = result.length > 0 ? result[0].totalRevenue : 0;

			res.send({
				users,
				menuItems,
				orders,
				revenue,
			});
		});

		// using aggregate pipeline
		app.get("/order-stats", verifyToken, verifyAdmin, async (req, res) => {
			const result = await paymentCollection
				.aggregate([
					{
						$unwind: "$menuItemIds",
					},
					{
						$lookup: {
							from: "menu",
							localField: "menuItemIds",
							foreignField: "_id",
							as: "menuItems",
						},
					},
					{
						$unwind: "$menuItems",
					},
					{
						$group: {
							_id: "$menuItems.category",
							quantity: { $sum: 1 },
							revenue: { $sum: "$menuItems.price" },
						},
					},
					{
						$project: {
							_id: 0,
							category: "$_id",
							quantity: "$quantity",
							revenue: "$revenue",
						},
					},
				])
				.toArray();

			res.send(result);
		});

		// Send a ping to confirm a successful connection
		// await client.db("admin").command({ ping: 1 });
		// console.log("Pinged your deployment. You successfully connected to MongoDB!");
	} finally {
		// Ensures that the client will close when you finish/error
		// await client.close();
	}
}
run().catch(console.dir);

app.listen(port, () => {
	console.log("Server running on port: ", port);
});
