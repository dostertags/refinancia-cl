import Wizard from "@/components/Wizard";

export default function Home() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">¿Puedes pagar menos por tus deudas?</h1>
      <p className="mb-6 text-slate-600">
        Simula en 4 pasos cuánto ahorrarías consolidando tus créditos de consumo y tarjetas. Tus datos no se guardan.
      </p>
      <Wizard />
    </>
  );
}
