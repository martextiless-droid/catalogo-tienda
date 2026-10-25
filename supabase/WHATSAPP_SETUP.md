# Conexión de WhatsApp Business

La función `martextiles-whatsapp` recibe el webhook de Meta, verifica su firma, guarda el contacto y el historial en tablas privadas de Supabase, consulta el catálogo y responde por WhatsApp. Para referencias reconocidas, puede enviar hasta cuatro fotos activas; las fotos diarias se administran en `whatsapp_fotos_referencia`.

## Antes de desplegar

1. En Supabase, abre **SQL Editor** y ejecuta el archivo `supabase-migration-whatsapp.sql` de la raíz del proyecto.
2. En **Edge Functions → Secrets**, confirma que exista `OPENAI_API_KEY`. El runtime de Supabase provee `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`; no copies la clave de servicio al sitio web.
3. En la app de Meta con WhatsApp Cloud API, configura estos secretos en Supabase:

   - `WHATSAPP_VERIFY_TOKEN`: una frase aleatoria creada para verificar el webhook.
   - `WHATSAPP_APP_SECRET`: secreto de la app de Meta; se usa solo para validar la firma de cada notificación.
   - `WHATSAPP_ACCESS_TOKEN`: token de acceso de WhatsApp Business.
   - `WHATSAPP_PHONE_NUMBER_ID`: identificador del número de WhatsApp registrado en Meta.
   - `WHATSAPP_GRAPH_API_VERSION`: versión vigente de Graph API que muestra la configuración/documentación de Meta, con formato `vNN.N`.

   No compartas estos valores por el chat ni los incluyas en archivos del sitio.

## Despliegue y configuración de Meta

Despliega `martextiles-whatsapp` al proyecto Supabase después de guardar los secretos. La URL de callback será:

`https://nsuxvytaogbnrlopzfgi.supabase.co/functions/v1/martextiles-whatsapp`

En la configuración de Webhooks de Meta, pega esa URL y el mismo `WHATSAPP_VERIFY_TOKEN`, verifica el callback y suscribe el campo `messages` de la cuenta de WhatsApp Business.

## Alcance de esta primera etapa

- Recibe mensajes entrantes de texto y responde usando el catálogo vigente y memoria reciente guardada por número.
- Para mensajes entrantes de imagen/audio u otros tipos, responde que por ahora solo atiende texto.
- Envía hasta cuatro fotos de la última tanda activa si la referencia existe en el catálogo y tiene fotos cargadas. Si no, usa las imágenes de catálogo existentes cuando estén disponibles.
- La carga y activación de fotos diarias desde una pantalla administrativa todavía es una etapa posterior; las tablas quedan preparadas.
- Meta requiere que el cliente inicie la conversación para poder responder con mensajes libres dentro de la ventana de atención aplicable. Para iniciar conversaciones fuera de esa ventana se deben usar plantillas aprobadas.

No actives el webhook en producción hasta que la migración y los secretos estén configurados. Haz primero una prueba con un número de prueba de Meta.
