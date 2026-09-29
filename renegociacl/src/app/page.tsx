import Calculadora from "@/components/Calculadora";

export default function Home() {
  return (
    <>
      <h1 className="text-2xl font-extrabold sm:text-3xl">¿Cuánto puedes ahorrar en tu crédito?</h1>
      <p className="mb-5 mt-1 text-suave">Escribe cuánto debes, tu cuota y tu tasa. Te mostramos cuántos pesos y meses podrías ahorrar. Sin registro.</p>
      <Calculadora />
    </>
  );
}
