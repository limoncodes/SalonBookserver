import express from "express"
import 'dotenv/config'
import cors from "cors"
import { MongoClient, ObjectId } from "mongodb"
const app = express()
// middleware
app.use(cors())
app.use(express.json())
const port = process.env.PORT || 5000
const client = new MongoClient(`mongodb+srv://${process.env.MONGODB_USERNAME_URL}:${process.env.MONGODB_PASSWORD_URL}@cluster0.4dwew1j.mongodb.net/`);

const database = client.db('SalonBook')
const addServices = database.collection("addServices")


app.get('/', (req, res) => {
  res.send('SalonBook')

})
app.post('/Add-Services', async (req, res) => {
  try {
    const data = req.body
    const result = await addServices.insertOne(data)
    res.send(result)
  } catch (error) {
    console.error("Add service error:", error)
    res.status(500).send({ message: "Failed to add service", error: error.message })
  }
})
app.get("/addServices", async (req, res) => {
  try {
    const { search, category, sort } = req.query

    const query = {}
    if (search) {
      query.serviceName = { $regex: String(search), $options: "i" }
    }
    if (category && category !== "All") {
      query.serviceCategory = String(category)
    }

    let sortOption = {}
    if (sort === "price-low") sortOption = { price: 1 }
    if (sort === "price-high") sortOption = { price: -1 }

    const data = await addServices.find(query).sort(sortOption).toArray()
    res.send(data)
  } catch (error) {
    console.error("Get services error:", error)
    res.status(500).send({ message: "Failed to get services", error: error.message })
  }
})

app.get("/addServices/:id", async (req, res) => {
  try {
    const { id } = req.params
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid service id" })
    }

    const service = await addServices.findOne({ _id: new ObjectId(id) })
    if (!service) {
      return res.status(404).send({ message: "Service not found" })
    }

    res.send(service)
  } catch (error) {
    console.error("Get service error:", error)
    res.status(500).send({ message: "Failed to get service", error: error.message })
  }
})


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})