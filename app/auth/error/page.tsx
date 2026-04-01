export default function AuthErrorPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center px-6 py-16">
      <section className="w-full rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
        <h1 className="text-2xl font-semibold text-red-900">
          No se pudo iniciar sesion
        </h1>
        <p className="mt-3 text-red-800">
          Ocurrio un problema con Google OAuth. Intenta de nuevo desde la pagina
          principal.
        </p>
      </section>
    </main>
  );
}
