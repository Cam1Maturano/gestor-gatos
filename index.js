import TelegramBot from "node-telegram-bot-api";
import { google } from "googleapis";
import fs from "fs";

// 🔑 Config
const TOKEN = process.env.TELEGRAM_TOKEN;
const SHEET_ID = "1nAzD0HjcdWzgqi2s7iMR4kbFLpTHuOpJg2i0db-0tXQ"; // tu sheet ID

// Inicializar bot
const bot = new TelegramBot(TOKEN, { polling: true });

// // Autenticación Google
// const auth = new google.auth.GoogleAuth({
//   keyFile: CREDENTIALS_PATH,
//   scopes: ["https://www.googleapis.com/auth/spreadsheets"],
// });

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"), // 👈 importante
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// Categorías válidas
const CATEGORIAS_VALIDAS = [
  "Arreglos",
  "Agua",
  "Carne",
  "Limpieza",
  "Super",
  "Verdura",
];

// 👉 Función para normalizar y parsear montos
function parseMonto(input) {
  // Quita puntos de miles y reemplaza coma por punto
  const normalizado = input.replace(/\./g, "").replace(",", ".");
  return parseFloat(normalizado);
}

// 👉 Función para guardar gasto
async function saveExpense(texto, usuario, chatId) {
  const sheetName = getSheetName();
  const [categoriaInput, montoStr, ...rest] = texto.split(" ");
  const categoria =
    categoriaInput.charAt(0).toUpperCase() +
    categoriaInput.slice(1).toLowerCase();
  const monto = parseMonto(montoStr);
  const nota = rest.join(" ") || "";

  // Validar categoría
  if (!CATEGORIAS_VALIDAS.includes(categoria)) {
    await bot.sendMessage(
      chatId,
      `❌ Categoría inválida: *${categoriaInput}*\nLas categorías permitidas son:\n${CATEGORIAS_VALIDAS.join(
        ", "
      )}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const row = [
    new Date().toLocaleString("es-AR"), // Fecha
    categoria,
    nota,
    usuario,
    monto,
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!G4:K`, // 👈 ajustá según tu tabla
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });

  await bot.sendMessage(
    chatId,
    `✅ Gasto guardado: ${categoria} - ${monto.toLocaleString("es-AR", {
      minimumFractionDigits: 2,
    })} (${nota ? nota : "sin nota"})`,
    { parse_mode: "Markdown" }
  );
}

// 👉 Escuchar mensajes normales
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const texto = msg.text;
  const usuario = msg.from.first_name || "Desconocido";

  // Verificar formato: palabra + número
  if (/^[a-zA-ZáéíóúÁÉÍÓÚñÑ]+\s+[0-9.,]+/.test(texto)) {
    await saveExpense(texto, usuario, chatId);
  } else if (!texto.startsWith("/")) {
    bot.sendMessage(
      chatId,
      "⚠️ Formato incorrecto.\nUsá: `categoria monto nota`\nEjemplo: `Super 3.500,50 frutas`",
      { parse_mode: "Markdown" }
    );
  }
});

// 👉 Función para reporte
async function getReport(chatId) {
  const sheetName = getSheetName();

  // Traer todas las celdas de una sola vez
  const [tablaGastos, categoriasSheet, fijoSheet, totalSheet, disponibleSheet] =
    await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!G4:K`, // tabla de gastos
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!D26:D31`, // valores categorías
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!D10`, // total fijo
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!D9`, // total
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!D11`, // disponible
      }),
    ]);

  const rows = tablaGastos.data.values || [];
  if (rows.length === 0) {
    await bot.sendMessage(chatId, "⚠️ No hay gastos registrados todavía.");
    return;
  }

  // Categorías e iconos
  const categorias = [
    "Arreglos",
    "Agua",
    "Carne",
    "Limpieza",
    "Super",
    "Verdura",
  ];
  const iconos = ["⚙️", "💧", "🥩", "🧹", "💳", "🥦"];

  let mensaje = "📊 *Reporte de gastos*\n\n";
  categorias.forEach((cat, i) => {
    const valor = categoriasSheet.data.values?.[i]?.[0] || "0";
    mensaje += `\n${iconos[i]} *${cat}:* ${valor}`;
  });

  const total = totalSheet.data.values?.[0]?.[0] || "0";
  const disponible = disponibleSheet.data.values?.[0]?.[0] || "0";
  const fijo = fijoSheet.data.values?.[0]?.[0] || "0";

  mensaje += `\n\n💵 *Total variable:* ${total}`;
  mensaje += `\n\n💵 *Total fijo:* ${fijo}`;
  mensaje += `\n\n💵 *Disponible:* ${disponible}`;

  await bot.sendMessage(chatId, mensaje, { parse_mode: "Markdown" });
}

// 👉 Comando /reporte
bot.onText(/\/reporte/, async (msg) => {
  const chatId = msg.chat.id;
  await getReport(chatId);
});

// 👉 Hoja dinámica por mes
function getSheetName() {
  const meses = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const hoy = new Date();
  const mes = meses[hoy.getMonth()];
  return `${mes}-2025`;
}
