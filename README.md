# Appointment Monitor

Monitor genérico de disponibilidad de citas, basado en Playwright y GitHub Actions. Está preparado para consultar una URL configurable y detectar horarios seleccionables. Por privacidad, **no se almacena ninguna URL de reservas, nombre de profesional ni dato de paciente en el repositorio**.

## Estado

- Código publicado, con 10 pruebas unitarias para evitar falsos positivos.
- Workflow programado cada hora (puede sufrir retrasos de GitHub Actions).
- Utiliza Google Chrome preinstalado en Ubuntu y caché de dependencias Node.js; evita descargar Chromium en cada revisión.
- Si faltan secretos, la ejecución termina sin consultar ninguna web.
- **Alertas desactivadas por seguridad** hasta confirmar una ejecución real contra el portal.
- La ejecución manual puede enviar una captura privada por Telegram si se configuran las credenciales.
- No se realizan reservas, logins ni bypass de CAPTCHA.

## Configuración de secretos

Ve a **Settings → Secrets and variables → Actions → New repository secret** y crea estos valores:

| Secret | Contenido |
|---|---|
| `BOOKING_URL` | URL HTTPS completa de la agenda, sin parámetros de analítica o seguimiento. |
| `EXPECTED_PRACTITIONER_NAME` | Nombre y apellido del profesional tal como aparece en pantalla. |
| `DATE_QUERY_PARAM` | Nombre del parámetro de consulta que controla la fecha. |
| `TELEGRAM_BOT_TOKEN` | Token privado del bot creado con [@BotFather](https://t.me/BotFather). |
| `TELEGRAM_CHAT_ID` | Identificador del chat privado con el bot. |

Nunca publiques sus valores en commits, Issues, logs, capturas de pantallas públicas ni pull requests.

## Prueba real

1. Configura los secretos.
2. En **Actions → Appointment Availability Check → Run workflow** ejecuta una comprobación manual.
3. Recibirás un resultado resumido y, si se configuró Telegram y la página se pudo abrir, una captura privada.
4. Valida que el nombre del profesional aparezca correctamente y que las horas se interpreten bien. Si el portal exige RUT, sesión, CAPTCHA o cambia su estructura, es posible que el resultado sea `unknown`.
5. **No actives las alertas hasta validar la captura.** Para activarlas, cambia `ALERTS_ENABLED: 'false'` por `'true'` en `.github/workflows/monitor.yml`.

La automatización revisa las fechas de inicio **hoy, +7 y +14 días**. Esto no implica cobertura de todas las fechas futuras: depende del calendario que muestre el portal. Se deberá adaptar a su estructura real si fuera necesario.

## Privacidad, costos y limitaciones

Este proyecto no sube screenshots ni reportes privados como artefactos de GitHub. Los logs de Actions son visibles en repositorios públicos, por lo que el código imprime únicamente estados técnicos no identificables. En modo piloto, las capturas se envían solamente a Telegram. Los secretos no protegen frente a colaboradores maliciosos con permisos de modificación del workflow; controla quién puede editarlo.

En repositorios públicos, los runners estándar de GitHub Actions son gratuitos sujetos a políticas de GitHub. Los workflows programados pueden retrasarse y GitHub puede desactivarlos después de inactividad prolongada del repositorio. No se promete vigilancia en tiempo real ni una reserva asegurada.

## Rendimiento del runner

Los runners de GitHub Actions son temporales y se crean desde cero. El workflow ahora aprovecha **Google Chrome que ya viene instalado** y una caché de `node_modules`/npm. La primera ejecución con esta configuración creará la caché; las siguientes deberían saltarse la instalación de paquetes mientras `package.json` no cambie. El tiempo de arrancar y limpiar el runner sigue existiendo.

## Desarrollo local

```bash
npm install
npx playwright install chromium
npm test
# Exporta las variables de entorno privadas antes de ejecutar:
npm run monitor
```
