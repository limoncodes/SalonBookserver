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
const appointments = database.collection("appointments")


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
    const { search, category, sort, status } = req.query

    const query = {}
    if (search) {
      query.serviceName = { $regex: String(search), $options: "i" }
    }
    if (category && category !== "All") {
      query.serviceCategory = String(category)
    }
    if (status && status !== "All") {
      query.serviceStatus = String(status)
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

app.patch("/addServices/:id", async (req, res) => {
  try {
    const { id } = req.params
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid service id" })
    }

    const { _id, ...updates } = req.body || {}
    const result = await addServices.updateOne(
      { _id: new ObjectId(id) },
      { $set: updates },
    )

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Service not found" })
    }

    res.send(result)
  } catch (error) {
    console.error("Update service error:", error)
    res.status(500).send({ message: "Failed to update service", error: error.message })
  }
})

app.delete("/addServices/:id", async (req, res) => {
  try {
    const { id } = req.params
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid service id" })
    }

    const result = await addServices.deleteOne({ _id: new ObjectId(id) })
    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Service not found" })
    }

    res.send(result)
  } catch (error) {
    console.error("Delete service error:", error)
    res.status(500).send({ message: "Failed to delete service", error: error.message })
  }
})

app.post("/appointments", async (req, res) => {
  try {
    const {
      serviceId,
      serviceName,
      serviceCategory,
      price,
      duration,
      appointmentDate,
      timeSlot,
      message,
      userEmail,
      userName,
    } = req.body || {}

    if (!userEmail) {
      return res.status(401).send({ message: "Authentication required" })
    }
    if (!serviceId || !ObjectId.isValid(serviceId)) {
      return res.status(400).send({ message: "Valid service is required" })
    }
    if (!appointmentDate || !timeSlot) {
      return res.status(400).send({ message: "Appointment date and time slot are required" })
    }

    const service = await addServices.findOne({ _id: new ObjectId(serviceId) })
    if (!service) {
      return res.status(404).send({ message: "Service not found" })
    }
    if (service.serviceStatus !== "Active") {
      return res.status(400).send({ message: "Cannot book an inactive service" })
    }

    const duplicate = await appointments.findOne({
      serviceId: String(serviceId),
      appointmentDate: String(appointmentDate),
      timeSlot: String(timeSlot),
      appointmentStatus: { $in: ["Pending", "Confirmed"] },
    })
    if (duplicate) {
      return res.status(409).send({ message: "This time slot is already booked for the selected date" })
    }

    const appointment = {
      serviceId: String(serviceId),
      serviceName: String(serviceName || service.serviceName || ""),
      serviceCategory: String(serviceCategory || service.serviceCategory || ""),
      price: Number(price ?? service.price ?? 0),
      duration: Number(duration ?? service.duration ?? 0),
      appointmentDate: String(appointmentDate),
      timeSlot: String(timeSlot),
      message: String(message || "").trim(),
      userEmail: String(userEmail).toLowerCase(),
      userName: String(userName || "").trim(),
      appointmentStatus: "Pending",
      paymentStatus: "Unpaid",
      createdAt: new Date(),
    }

    const result = await appointments.insertOne(appointment)
    res.send(result)
  } catch (error) {
    console.error("Create appointment error:", error)
    res.status(500).send({ message: "Failed to book appointment", error: error.message })
  }
})

app.get("/appointments", async (req, res) => {
  try {
    const { email } = req.query
    const query = {}
    if (email) query.userEmail = String(email).toLowerCase()

    const data = await appointments.find(query).sort({ createdAt: -1 }).toArray()
    res.send(data)
  } catch (error) {
    console.error("Get appointments error:", error)
    res.status(500).send({ message: "Failed to get appointments", error: error.message })
  }
})


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})