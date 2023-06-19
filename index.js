const express = require('express');
const cors = require('cors');
require('dotenv').config()
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const stripe = require('stripe')(process.env.PAYMENT_TOKEN)


const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
const verifyJwt = (req, res, next) => {
  const authorization = req.headers.authorization;
  // console.log(authorization)
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'Unauthorized acces' })
  }
  const token = authorization.split(' ')[1]

  jwt.verify(token, process.env.API_TOKEN, (error, decode) => {
    // console.log({error})
    // console.log({decode})
    if (error) {
      return res.status(401).send({ error: true, message: 'Unauthorized acces' })

    }
    req.decode = decode;
    next();
  })
}



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oeyyszo.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});




async function run() {
  try {
    // await client.connect();
    const classes = client.db('Clarionet').collection('classes');
    const instructor = client.db('Clarionet').collection('instructor');
    const carts = client.db('Clarionet').collection('cart');
    const user = client.db('Clarionet').collection('user');
    const pendingclass = client.db('Clarionet').collection('pending');
    const paymentCollection = client.db('Clarionet').collection('paymentCollection');




    // ------------------------------JWT AND ADMIN------------------
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.API_TOKEN, { expiresIn: '1h' })
// console.log(token)
      res.send({ token })
    })
    const verifyAdmin = async (req, res, next) => {
      const email = req.decode.email;
      const query = { email: email }
      const adminuser = await user.findOne(query);

      if (adminuser?.role !== 'Admin') {
        return res.status(403).send({ error: true, message: 'forbidden message' });
      }
      next();
    }








    // -----------------get my payment history--------------------

    app.get('/paym', async (req, res) => {
      const cursor = paymentCollection.find()
      const result = await cursor.toArray();
      res.send(result)
    })
    // --------------------get all claseess---------------------
    app.get('/class', async (req, res) => {
      const cursor = classes.find().sort({ "available_seats": -1 });
      const result = await cursor.toArray();
      // console.log(result)
      res.send(result)
    })

    // --------------Add classees--------------------
    app.post('/classes', async (req, res) => {
      const newClass = req.body;
      const result = await classes.insertOne(newClass)

      res.send(result)
    })
    app.get('/instruct', async (req, res) => {
      const cursor = instructor.find().sort({ "numberOfClasses": -1 });
      const result = await cursor.toArray();
      res.send(result)
    })
    app.get('/user', verifyJwt, verifyAdmin, async (req, res) => {
      const cursor = user.find()
      const result = await cursor.toArray();
      res.send(result)
    })
    app.get('/pendingClass', async (req, res) => {
      const cursor = pendingclass.find()
      const result = await cursor.toArray();
      res.send(result)
    })
    app.get('/cart', verifyJwt, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.send([])

      }
      const decodedEmail = req.decode.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'Access forbidden' })
      }
      const query = { email: email };
      const result = await carts.find(query).toArray();

      res.send(result)
    })

    app.get('/user/admin/:email', verifyJwt, async (req, res) => {
      const email = req.params.email
      if (req.decode.email !== email) {
        res.send({ admin: false })
      }

      const query = { email: email }

      const prouser = await user.findOne(query)
      const result = { admin: prouser?.role === 'Admin' }
      res.send(result)
    })
    app.get('/user/instructor/:email', verifyJwt, async (req, res) => {
      const email = req.params.email
      if (req.decode.email !== email) {
        res.send({ Instructor: false })
      }

      const query = { email: email }

      const prouser = await user.findOne(query)
      const result = { instructor: prouser?.role === 'Instructor' }
      res.send(result)
    })

    app.post('/cart', async (req, res) => {
      const item = req.body
      const result = await carts.insertOne(item);
      res.send(result)
    })
    app.post('/pending', async (req, res) => {
      const item = req.body
      const result = await pendingclass.insertOne(item);
      res.send(result)
    })
    app.post('/user', async (req, res) => {
      const item = req.body
      const query = { email: item.email }
      const existUser = await user.findOne(query)
      if (existUser) {
        return res.send({ message: 'This user is already exists' })
      }
      const result = await user.insertOne(item);
      res.send(result)
    })


    app.delete('/cart/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await carts.deleteOne(query);
      res.send(result)
    })
    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await user.deleteOne(query);
      res.send(result)
    })

    // --------------------The payment section STRIPE------------------

    app.post('/create-payment-intent', verifyJwt, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log({ price, amount })
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })


    app.post('/payments', verifyJwt, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);
      const id = payment.classId
      const query = { _id: { $in: [new ObjectId(id)] } }
      const deleteResult = await carts.deleteOne(query)

      res.send({ insertResult, deleteResult });
    })
    // --------------------The payment section STRIPE------------------

    app.patch('/users/admin/:id', async (req, res) => {
      const _id = req.params.id;
      const filter = { _id: new ObjectId(_id) }
      const updateDoc = { $set: { role: 'Admin' } }
      const result = await user.updateOne(filter, updateDoc)
      res.send(result)
    })
    // ---------------making instructor-----------------
    app.patch('/users/instructor/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = { $set: { role: 'Instructor' } }
      const result = await user.updateOne(filter, updateDoc)
      res.send(result)
    })
    app.put('/classes/:id', async (req, res) => {
      const id = req.params.id;
      console.log(typeof id)
      const filter = { _id: new ObjectId(id) }
      console.log(filter)
      const option={upsert:true}
      const updateDoc = { $set: { status: 'Approved' } };
      const result = await classes.updateOne(filter, updateDoc,option)
      res.send(result)
    })
    app.put('/denied/:id', async (req, res) => {
      const id = req.params.id;
      console.log(typeof id)
      const filter = { _id: new ObjectId(id) }
      console.log(filter)
      const option={upsert:true}
      const updateDoc = { $set: { status: 'Denied' } };
      const result = await classes.updateOne(filter, updateDoc,option)
      res.send(result)
    })
    app.put('/feedback/:id', async (req, res) => {
      const id = req.params.id;
      // console.log(typeof id)
      const review=req.body.review
      console.log(review)
      const filter = { _id: new ObjectId(id) }
      // console.log(filter)
      const option={upsert:true}
      const updateDoc = { $set: { feedback: review } };
      const result = await classes.updateOne(filter, updateDoc,option)
      res.send(result)
    })


    app.patch('/class/:id', async (req, res) => {
      const id = req.params.id;
      const clas = req.body;


      const filter = { _id: new ObjectId(id) }
      const options = { upsert: true }
      const updateClass = {
        $set: {
          available_seats: clas.updatedSeat,
        }
      }

      const result = await classes.updateOne(filter, updateClass, options);
      res.send(result);

    })





    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {

  }
}
run().catch(console.dir);










app.get('/', (req, res) => {
  res.send('clarionet is running ')
})
app.listen(port, () => {
  console.log(`Clarionet running on port ${port}`)
})