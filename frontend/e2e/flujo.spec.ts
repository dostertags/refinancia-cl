import { expect, test } from "@playwright/test";

// Flujo completo de 4 pasos contra la app real (ofertas de la semilla ilustrativa si no hay datos SERNAC).
test("el usuario simula y ve avisos legales, origen de ofertas y glosario", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/renta líquida mensual/i).fill("1500000");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /continuar/i }).click();

  await page.getByLabel("Institución").fill("Banco Prueba");
  await page.getByLabel("Monto adeudado").fill("3000000");
  await page.getByLabel("Tasa mensual (%)").fill("3");
  await page.getByLabel("Cuota actual").fill("153059");
  await page.getByLabel("Meses restantes").fill("30");
  await page.getByRole("button", { name: /simular/i }).click();

  await expect(page.getByText(/no constituye una oferta de crédito/i).first()).toBeVisible();
  await expect(page.getByText(/derecho a retracto/i).first()).toBeVisible();
  await expect(page.getByText(/ilustrativas|Comparador de Créditos SERNAC/i).first()).toBeVisible();
  await page.getByText(/qué significan CAE/i).click();
  await expect(page.getByText(/Carga Anual Equivalente/i)).toBeVisible();

  await page.getByRole("button", { name: /ver informe/i }).click();
  const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /descargar pdf/i }).click()]);
  expect(descarga.suggestedFilename()).toBe("informe-refinanciacl.pdf");
});

test("no permite continuar sin aceptar que es una simulación", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/renta líquida mensual/i).fill("1500000");
  await page.getByRole("button", { name: /continuar/i }).click();
  await expect(page.getByText(/debes aceptar/i)).toBeVisible();
});

test("datos inconsistentes muestran un mensaje claro", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/renta líquida mensual/i).fill("3000000");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /continuar/i }).click();
  await page.getByLabel("Institución").fill("Banco Prueba");
  await page.getByLabel("Monto adeudado").fill("1000000");
  await page.getByLabel("Tasa mensual (%)").fill("2");
  await page.getByLabel("Cuota actual").fill("200000");
  await page.getByLabel("Meses restantes").fill("24");
  await page.getByRole("button", { name: /simular/i }).click();
  await expect(page.getByRole("heading", { name: /revisa los datos/i })).toBeVisible();
});
