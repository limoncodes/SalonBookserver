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
      serviceImage: String(req.body?.serviceImage || service.serviceImage || ""),
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

app.get("/appointments/:id", async (req, res) => {
  try {
    const { id } = req.params
    const { email } = req.query
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid appointment id" })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(id) })
    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" })
    }
    if (email && String(appointment.userEmail).toLowerCase() !== String(email).toLowerCase()) {
      return res.status(403).send({ message: "Forbidden" })
    }

    res.send(appointment)
  } catch (error) {
    console.error("Get appointment error:", error)
    res.status(500).send({ message: "Failed to get appointment", error: error.message })
  }
})

app.patch("/appointments/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params
    const { userEmail } = req.body || {}
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid appointment id" })
    }
    if (!userEmail) {
      return res.status(401).send({ message: "Authentication required" })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(id) })
    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" })
    }
    if (String(appointment.userEmail).toLowerCase() !== String(userEmail).toLowerCase()) {
      return res.status(403).send({ message: "You can only cancel your own appointment" })
    }
    if (appointment.appointmentStatus !== "Pending") {
      return res.status(400).send({ message: "Only pending appointments can be cancelled" })
    }

    const result = await appointments.updateOne(
      { _id: new ObjectId(id) },
      { $set: { appointmentStatus: "Cancelled" } },
    )
    res.send(result)
  } catch (error) {
    console.error("Cancel appointment error:", error)
    res.status(500).send({ message: "Failed to cancel appointment", error: error.message })
  }
})

app.patch("/appointments/:id/pay", async (req, res) => {
  try {
    const { id } = req.params
    const { userEmail } = req.body || {}
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid appointment id" })
    }
    if (!userEmail) {
      return res.status(401).send({ message: "Authentication required" })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(id) })
    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" })
    }
    if (String(appointment.userEmail).toLowerCase() !== String(userEmail).toLowerCase()) {
      return res.status(403).send({ message: "You can only pay for your own appointment" })
    }
    if (appointment.appointmentStatus !== "Confirmed") {
      return res.status(400).send({ message: "Only confirmed appointments can be paid" })
    }
    if (appointment.paymentStatus === "Paid") {
      return res.status(400).send({ message: "Appointment is already paid" })
    }

    const result = await appointments.updateOne(
      { _id: new ObjectId(id) },
      { $set: { paymentStatus: "Paid" } },
    )
    res.send(result)
  } catch (error) {
    console.error("Pay appointment error:", error)
    res.status(500).send({ message: "Failed to pay for appointment", error: error.message })
  }
})

app.patch("/appointments/:id/confirm", async (req, res) => {
  try {
    const { id } = req.params
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid appointment id" })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(id) })
    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" })
    }
    if (appointment.appointmentStatus !== "Pending") {
      return res.status(400).send({ message: "Only pending appointments can be confirmed" })
    }

    const result = await appointments.updateOne(
      { _id: new ObjectId(id) },
      { $set: { appointmentStatus: "Confirmed" } },
    )
    res.send(result)
  } catch (error) {
    console.error("Confirm appointment error:", error)
    res.status(500).send({ message: "Failed to confirm appointment", error: error.message })
  }
})

app.patch("/appointments/:id/admin-cancel", async (req, res) => {
  try {
    const { id } = req.params
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid appointment id" })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(id) })
    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" })
    }
    if (!["Pending", "Confirmed"].includes(appointment.appointmentStatus)) {
      return res.status(400).send({ message: "Only pending or confirmed appointments can be cancelled" })
    }

    const result = await appointments.updateOne(
      { _id: new ObjectId(id) },
      { $set: { appointmentStatus: "Cancelled" } },
    )
    res.send(result)
  } catch (error) {
    console.error("Admin cancel appointment error:", error)
    res.status(500).send({ message: "Failed to cancel appointment", error: error.message })
  }
})

app.patch("/appointments/:id/complete", async (req, res) => {
  try {
    const { id } = req.params
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid appointment id" })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(id) })
    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" })
    }
    if (appointment.appointmentStatus !== "Confirmed") {
      return res.status(400).send({ message: "Only confirmed appointments can be completed" })
    }

    const result = await appointments.updateOne(
      { _id: new ObjectId(id) },
      { $set: { appointmentStatus: "Completed" } },
    )
    res.send(result)
  } catch (error) {
    console.error("Complete appointment error:", error)
    res.status(500).send({ message: "Failed to complete appointment", error: error.message })
  }
})

app.patch("/appointments/:id/mark-paid", async (req, res) => {
  try {
    const { id } = req.params
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid appointment id" })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(id) })
    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" })
    }
    if (appointment.appointmentStatus === "Cancelled") {
      return res.status(400).send({ message: "Cancelled appointments cannot be marked as paid" })
    }
    if (appointment.paymentStatus === "Paid") {
      return res.status(400).send({ message: "Appointment is already paid" })
    }

    const result = await appointments.updateOne(
      { _id: new ObjectId(id) },
      { $set: { paymentStatus: "Paid" } },
    )
    res.send(result)
  } catch (error) {
    console.error("Mark paid error:", error)
    res.status(500).send({ message: "Failed to mark appointment as paid", error: error.message })
  }
})

app.delete("/appointments/:id", async (req, res) => {
  try {
    const { id } = req.params
    const { email } = req.query
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid appointment id" })
    }
    if (!email) {
      return res.status(401).send({ message: "Authentication required" })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(id) })
    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" })
    }
    if (String(appointment.userEmail).toLowerCase() !== String(email).toLowerCase()) {
      return res.status(403).send({ message: "You can only delete your own appointment" })
    }
    if (appointment.appointmentStatus !== "Cancelled") {
      return res.status(400).send({ message: "Only cancelled appointments can be deleted" })
    }

    const result = await appointments.deleteOne({ _id: new ObjectId(id) })
    res.send(result)
  } catch (error) {
    console.error("Delete appointment error:", error)
    res.status(500).send({ message: "Failed to delete appointment", error: error.message })
  }
})


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})