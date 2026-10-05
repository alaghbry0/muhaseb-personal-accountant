import { db } from "../src/lib/db"
async function main() {
  const cs = await db.customer.findMany({ select: { id: true, name: true, creditLimit: true } })
  console.log(JSON.stringify(cs))
  await db.$disconnect()
}
main()
