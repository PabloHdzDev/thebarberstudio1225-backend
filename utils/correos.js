// Piezas de los correos que reciben los clientes: la misma cabecera de la
// marca, un botón y el enlace escrito por si el botón no funciona.

// El nombre lo escribe el cliente al registrarse: no debe colarse como HTML
const escaparHtml = (texto) => String(texto ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// "luis garcía" -> "Hola, Luis"
const saludoPara = (nombre) => {
  const primero = String(nombre || '').trim().split(/\s+/)[0] || '';
  return primero ? `Hola, ${primero.charAt(0).toUpperCase()}${primero.slice(1)}` : 'Hola';
};

// Los párrafos y la nota son textos fijos del sistema; el saludo se escapa
const correoConBoton = ({ saludo, parrafos, boton, enlace, nota }) => `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #eeeeee; border-radius: 12px; overflow: hidden;">
    <div style="background: #111111; padding: 22px 28px; border-bottom: 4px solid #C2A27C;">
      <p style="margin: 0; color: #C2A27C; font-size: 12px; font-weight: bold; letter-spacing: 3px; text-transform: uppercase;">The Barber Studio 1225</p>
    </div>
    <div style="padding: 28px; color: #333333;">
      <h2 style="margin: 0 0 14px; color: #111111; font-size: 22px;">${escaparHtml(saludo)}</h2>
      ${parrafos.map((p) => `<p style="margin: 0 0 8px; line-height: 1.6;">${p}</p>`).join('\n      ')}
      <p style="text-align: center; margin: 28px 0;">
        <a href="${enlace}" style="background: #111111; color: #C2A27C; text-decoration: none; padding: 14px 30px; border-radius: 8px; font-weight: bold; display: inline-block;">
          ${boton}
        </a>
      </p>
      <p style="margin: 0 0 6px; font-size: 12px; color: #888888;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
      <p style="margin: 0 0 22px; font-size: 12px; word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 6px;">${enlace}</p>
      <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #888888;">${nota}</p>
    </div>
  </div>
`;

module.exports = { escaparHtml, saludoPara, correoConBoton };
