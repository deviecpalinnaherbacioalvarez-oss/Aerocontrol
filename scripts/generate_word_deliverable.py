import os
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, hex_color):
    """Establece el color de fondo de una celda."""
    shading_xml = f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>'
    cell._tc.get_or_add_tcPr().append(parse_xml(shading_xml))

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    """Establece el espaciado interno (padding) de una celda en dxa."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('w:top', top), ('w:bottom', bottom), ('w:left', left), ('w:right', right)]:
        node = OxmlElement(m)
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def set_table_borders(table, color="CCCCCC", sz="4", val="single"):
    """Aplica bordes finos a una tabla."""
    tblPr = table._tbl.tblPr
    borders_xml = f'''
    <w:tblBorders {nsdecls("w")}>
        <w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
        <w:left w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
        <w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
        <w:right w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
        <w:insideH w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
        <w:insideV w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
    </w:tblBorders>
    '''
    tblPr.append(parse_xml(borders_xml))

def format_row(row, bg_color, is_header=False):
    for cell in row.cells:
        set_cell_background(cell, bg_color)
        set_cell_margins(cell, top=120, bottom=120, left=150, right=150)
        for p in cell.paragraphs:
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            for run in p.runs:
                if is_header:
                    run.font.bold = True
                    run.font.color.rgb = RGBColor(255, 255, 255)
                    run.font.size = Pt(9.5)
                else:
                    run.font.size = Pt(9)
                    run.font.color.rgb = RGBColor(30, 41, 59)

def create_callout(doc, title, text, border_color="0284C7", bg_color="F0F9FF"):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.cell(0, 0)
    set_cell_background(cell, bg_color)
    set_cell_margins(cell, top=140, bottom=140, left=200, right=200)
    
    # Left thick border only
    borders_xml = f'''
    <w:tcBorders {nsdecls("w")}>
        <w:top w:val="none"/>
        <w:left w:val="single" w:sz="36" w:space="0" w:color="{border_color}"/>
        <w:bottom w:val="none"/>
        <w:right w:val="none"/>
    </w:tcBorders>
    '''
    cell._tc.get_or_add_tcPr().append(parse_xml(borders_xml))
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    run_t = p.add_run(f"📌 {title}\n")
    run_t.font.bold = True
    run_t.font.size = Pt(10)
    run_t.font.color.rgb = RGBColor(3, 105, 161)
    
    run_b = p.add_run(text)
    run_b.font.size = Pt(9.5)
    run_b.font.color.rgb = RGBColor(51, 65, 85)
    
    p_after = doc.add_paragraph()
    p_after.paragraph_format.space_after = Pt(4)

def build_document(output_path):
    doc = Document()
    
    # Configuración de márgenes estándar (2.5 cm)
    for section in doc.sections:
        section.top_margin = Inches(0.98)
        section.bottom_margin = Inches(0.98)
        section.left_margin = Inches(0.98)
        section.right_margin = Inches(0.98)
        
        # Header / Footer
        header = section.header
        p_hdr = header.paragraphs[0]
        p_hdr.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r_hdr = p_hdr.add_run("AeroControl Ops — Práctica de Campo: UML & Pruebas")
        r_hdr.font.size = Pt(8.5)
        r_hdr.font.color.rgb = RGBColor(148, 163, 184)
        
        footer = section.footer
        p_ftr = footer.paragraphs[0]
        p_ftr.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r_ftr = p_ftr.add_run("Ingeniería y Calidad de Software | ISO/IEC 25010:2023 — IEEE 29148")
        r_ftr.font.size = Pt(8.5)
        r_ftr.font.color.rgb = RGBColor(148, 163, 184)

    # Estilos base
    normal_style = doc.styles['Normal']
    normal_style.font.name = 'Calibri'
    normal_style.font.size = Pt(11)
    normal_style.font.color.rgb = RGBColor(30, 41, 59)
    normal_style.paragraph_format.line_spacing = 1.15
    normal_style.paragraph_format.space_after = Pt(6)

    # ==========================================
    # 1. PORTADA ACADÉMICA FORMAL
    # ==========================================
    p_portada_uni = doc.add_paragraph()
    p_portada_uni.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_portada_uni.paragraph_format.space_before = Pt(30)
    p_portada_uni.paragraph_format.space_after = Pt(4)
    run_uni = p_portada_uni.add_run("[NOMBRE DE LA UNIVERSIDAD]\nFACULTAD DE INGENIERÍA Y CIENCIAS APLICADAS\nCARRERA DE INGENIERÍA DE SISTEMAS / SOFTWARE")
    run_uni.font.bold = True
    run_uni.font.size = Pt(13)
    run_uni.font.color.rgb = RGBColor(15, 23, 42)

    p_div = doc.add_paragraph()
    p_div.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_div.paragraph_format.space_after = Pt(35)
    r_div = p_div.add_run("―" * 35)
    r_div.font.color.rgb = RGBColor(3, 105, 161)

    p_badge = doc.add_paragraph()
    p_badge.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_badge = p_badge.add_run("INFORME ACADÉMICO DE PRÁCTICA DE CAMPO")
    r_badge.font.bold = True
    r_badge.font.size = Pt(12)
    r_badge.font.color.rgb = RGBColor(3, 105, 161)

    p_titulo = doc.add_paragraph()
    p_titulo.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_titulo.paragraph_format.space_before = Pt(10)
    p_titulo.paragraph_format.space_after = Pt(15)
    r_tit = p_titulo.add_run("DIAGRAMA DE PAQUETES UML Y ESTRATEGIA INICIAL DE PRUEBAS\n")
    r_tit.font.bold = True
    r_tit.font.size = Pt(20)
    r_tit.font.color.rgb = RGBColor(11, 19, 31)
    
    r_sub = p_titulo.add_run("Sistema de Gestión y Control de Operaciones Aeroportuarias (AeroControl Ops)")
    r_sub.font.size = Pt(13.5)
    r_sub.font.color.rgb = RGBColor(71, 85, 105)

    p_div2 = doc.add_paragraph()
    p_div2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_div2.paragraph_format.space_before = Pt(30)
    p_div2.paragraph_format.space_after = Pt(40)

    # Tabla de datos de carátula
    tbl_meta = doc.add_table(rows=6, cols=2)
    tbl_meta.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(tbl_meta, color="E2E8F0")
    
    datos_meta = [
        ("ASIGNATURA:", "Práctica de Campo — Ingeniería de Software / Calidad de Software"),
        ("DOCENTE:", "[Nombre del Profesor / Docente Titular]"),
        ("ESTUDIANTE(S):", "[Nombre y Apellido del Estudiante / Código]"),
        ("HERRAMIENTA UML:", "Modelio 5.x (UML 2.5 Standard Package Diagram)"),
        ("ESTÁNDARES:", "ISO/IEC 25010:2023 | IEEE 29148 | WCAG 2.1 Nivel AA"),
        ("LIMA - PERÚ:", "Ciclo 2026-II")
    ]
    
    for idx, (label, val) in enumerate(datos_meta):
        row = tbl_meta.rows[idx]
        c0, c1 = row.cells
        c0.width = Inches(2.2)
        c1.width = Inches(4.5)
        c0.paragraphs[0].text = label
        c0.paragraphs[0].runs[0].font.bold = True
        c0.paragraphs[0].runs[0].font.size = Pt(10)
        c0.paragraphs[0].runs[0].font.color.rgb = RGBColor(3, 105, 161)
        c1.paragraphs[0].text = val
        c1.paragraphs[0].runs[0].font.size = Pt(10)
        c1.paragraphs[0].runs[0].font.color.rgb = RGBColor(30, 41, 59)
        set_cell_background(c0, "F8FAFC")
        set_cell_background(c1, "FFFFFF")
        set_cell_margins(c0, top=80, bottom=80, left=120, right=120)
        set_cell_margins(c1, top=80, bottom=80, left=120, right=120)

    doc.add_page_break()

    # ==========================================
    # 2. INTRODUCCIÓN Y ARQUITECTURA
    # ==========================================
    h1 = doc.add_heading("1. Introducción y Justificación Arquitectónica", level=1)
    h1.runs[0].font.color.rgb = RGBColor(3, 105, 161)
    h1.runs[0].font.size = Pt(16)
    
    doc.add_paragraph(
        "El presente informe detalla el diseño estructural y el aseguramiento formal de la calidad del software "
        "para el sistema AeroControl Ops, una plataforma de supervisión y gestión aeroportuaria en tiempo real "
        "desarrollada con backend en Node.js, frontend de página única (SPA) y simulación de radar en Canvas 2D."
    )
    
    doc.add_paragraph(
        "Para responder a las exigencias operacionales de alta concurrencia, disponibilidad y robustez de una torre "
        "de control aeroportuaria, se ha implementado una Arquitectura en Capas (Layered Architecture) estrictamente desacoplada, "
        "compuesta por cuatro ejes fundamentales:"
    )

    items_arq = [
        ("Capa de Presentación (Frontend SPA): ", "Módulos de visualización interactiva sin recarga de página, panel operativo de vuelos, gestión de contingencias climáticas y simulación de trazas de aeronaves."),
        ("Capa de Aplicación y Servicios (Backend REST API): ", "Despachadores HTTP nativos, controladores de dominio, validadores semánticos y servicios de lógica aeroportuaria especializada (prevención de colisiones en puertas, autorizaciones de despegue y rotación de matrículas)."),
        ("Capa de Persistencia y Acceso a Datos (Data Access Layer - DAL): ", "Repositorios fuertemente tipados y adaptadores de base de datos híbridos (SQLite para contingencias y pruebas locales, y MySQL para entorno corporativo de producción)."),
        ("Capa Transversal de Seguridad y Auditoría: ", "Mecanismos de autenticación mediante cookies HttpOnly, control de acceso basado en roles (RBAC), encriptación con SHA-256 y bitácora de auditoría inmutable con DNI y marca de tiempo.")
    ]
    for tit, desc in items_arq:
        p_item = doc.add_paragraph(style='List Bullet')
        r_t = p_item.add_run(tit)
        r_t.font.bold = True
        r_t.font.color.rgb = RGBColor(15, 23, 42)
        r_d = p_item.add_run(desc)
        r_d.font.color.rgb = RGBColor(51, 65, 85)

    create_callout(
        doc,
        "Cumplimiento con Estándares Internacionales",
        "El modelado estructural se ajusta a la norma ISO/IEC 19505-2 (UML 2.5), mientras que la formulación de requisitos y la estrategia de verificación se rigen bajo los estándares IEEE 29148, ISO/IEC 25010:2023 y las pautas de accesibilidad digital WCAG 2.1 (Nivel AA)."
    )

    # ==========================================
    # 3. MODELADO UML EN MODELIO
    # ==========================================
    doc.add_page_break()
    h2 = doc.add_heading("2. Diagrama de Paquetes UML (Modelio)", level=1)
    h2.runs[0].font.color.rgb = RGBColor(3, 105, 161)
    h2.runs[0].font.size = Pt(16)

    doc.add_paragraph(
        "De conformidad con las directivas de la cátedra, el modelado estructural del sistema se formaliza a través de un "
        "Diagrama de Paquetes UML 2.5 diseñado en la herramienta CASE Modelio 5.x. Este diagrama permite visualizar las agrupaciones "
        "lógicas de componentes, su cohesión interna y las relaciones de dependencia unidireccionales entre capas."
    )

    doc.add_heading("2.1 Guía de Mapeo y Construcción en Modelio 5.x", level=2)
    doc.add_paragraph(
        "Para replicar con precisión milimétrica el diseño en Modelio al momento de abrir el proyecto en casa, "
        "utilice la siguiente jerarquía de paquetes, componentes y estereotipos estándar:"
    )

    # Tabla de especificación para Modelio
    tbl_modelio = doc.add_table(rows=1, cols=4)
    tbl_modelio.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(tbl_modelio, color="CBD5E1")
    
    headers_mod = ["Paquete Raíz en Modelio", "Subpaquetes / Namespace", "Elementos Clave / Componentes", "Estereotipo UML"]
    for i, h in enumerate(headers_mod):
        tbl_modelio.rows[0].cells[i].paragraphs[0].text = h
    format_row(tbl_modelio.rows[0], "0369A1", is_header=True)

    rows_mod = [
        ("Capa Presentación (Client SPA)", "com.aerocontrol.ui.views", "DashboardView (index.html)\nRadarSimulatorView (torre_simulador.html)\nOperationalModals", "<<view>>\n<<boundary>>"),
        ("Capa Presentación (Client SPA)", "com.aerocontrol.ui.services", "ApiClient (Fetch / HTTP)\nAuthService (RBAC Client)\nRadarSyncService (postMessage)\nNotificationService", "<<service>>\n<<client>>"),
        ("Capa Presentación (Client SPA)", "com.aerocontrol.ui.accessibility", "FocusTrapManager\nAriaLiveAnnouncer\nHighContrastThemeController", "<<utility>>\n<<a11y>>"),
        ("Capa Aplicación (Backend REST)", "com.aerocontrol.backend.security", "SessionAuthMiddleware\nRoleAuthorizationMiddleware\nCryptoHasher (SHA-256)", "<<middleware>>\n<<security>>"),
        ("Capa Aplicación (Backend REST)", "com.aerocontrol.backend.controllers", "AuthController (/api/auth)\nVuelosController (/api/vuelos)\nIncidenciasController\nRecursosController\nReportesController\nSolicitudesController\nBitacoraController", "<<control>>\n<<REST API>>"),
        ("Capa Aplicación (Backend REST)", "com.aerocontrol.backend.domain.services", "SafetyGateService (Conflicto de puerta)\nFlightRotationService (Llegada -> Salida)\nAuditLogService (Trazabilidad DNI)", "<<domain>>\n<<service>>"),
        ("Capa Acceso a Datos (DAL)", "com.aerocontrol.data.repositories", "VuelosRepository\nIncidenciasRepository\nRecursosRepository\nUsuariosRepository\nBitacoraRepository", "<<repository>>\n<<entity>>"),
        ("Capa Acceso a Datos (DAL)", "com.aerocontrol.data.adapters", "SQLiteAdapter (node:sqlite DatabaseSync)\nMySQLAdapter (mysql2 / Pool)", "<<adapter>>\n<<database>>")
    ]

    for r_data in rows_mod:
        row = tbl_modelio.add_row()
        for idx, text in enumerate(r_data):
            row.cells[idx].paragraphs[0].text = text
        format_row(row, "F8FAFC" if len(tbl_modelio.rows) % 2 == 0 else "FFFFFF")

    doc.add_paragraph()
    doc.add_heading("2.2 Matriz de Dependencias y Trazabilidad entre Paquetes", level=2)
    doc.add_paragraph(
        "En Modelio, configure las relaciones de dependencia utilizando la herramienta 'Dependency' (flecha discontinua) "
        "y asigne los siguientes estereotipos de interacción:"
    )

    relaciones = [
        ("com.aerocontrol.ui.views ➔ com.aerocontrol.ui.services", "<<use>>", "Las vistas delegan el consumo de datos y autenticación a los servicios del cliente."),
        ("com.aerocontrol.ui.views ➔ com.aerocontrol.ui.accessibility", "<<use>>", "Los componentes visuales invocan el atrapamiento de foco y anuncios ARIA."),
        ("com.aerocontrol.ui.services ➔ com.aerocontrol.backend.controllers", "<<HTTP REST>>", "Comunicación cliente-servidor asíncrona mediante JSON sobre HTTP seguro."),
        ("com.aerocontrol.backend.controllers ➔ com.aerocontrol.backend.security", "<<verify>>", "Los controladores interceptan peticiones verificando sesión HttpOnly y RBAC."),
        ("com.aerocontrol.backend.controllers ➔ com.aerocontrol.backend.domain.services", "<<invoke>>", "Llamadas a reglas críticas (detección de choques y autorizaciones de torre)."),
        ("com.aerocontrol.backend.domain.services ➔ com.aerocontrol.data.repositories", "<<use>>", "Consulta y actualización del estado de vuelos, puertas y bitácora inmutable."),
        ("com.aerocontrol.data.repositories ➔ com.aerocontrol.data.adapters", "<<delegate>>", "Ejecución de sentencias SQL preparadas sobre SQLite o MySQL.")
    ]
    for rel, est, desc in relaciones:
        p_r = doc.add_paragraph(style='List Bullet')
        r1 = p_r.add_run(f"{rel} ")
        r1.font.bold = True
        r1.font.color.rgb = RGBColor(15, 23, 42)
        r2 = p_r.add_run(f"[{est}]: ")
        r2.font.bold = True
        r2.font.color.rgb = RGBColor(3, 105, 161)
        r3 = p_r.add_run(desc)
        r3.font.color.rgb = RGBColor(71, 85, 105)

    doc.add_paragraph()
    doc.add_heading("2.3 Diagrama de Paquetes Formal Exportado de Modelio", level=2)
    doc.add_paragraph(
        "A continuación se presenta el marco oficial reservado para la inserción del diagrama generado en Modelio. "
        "Al exportar el diagrama desde Modelio en formato PNG de alta resolución, pegue la imagen en el recuadro correspondiente:"
    )

    # RECUADRO MARCADOR MODELIO
    tbl_ph = doc.add_table(rows=1, cols=1)
    tbl_ph.alignment = WD_TABLE_ALIGNMENT.CENTER
    c_ph = tbl_ph.cell(0, 0)
    c_ph.width = Inches(6.5)
    set_cell_background(c_ph, "F8FAFC")
    set_cell_margins(c_ph, top=350, bottom=350, left=250, right=250)
    
    borders_ph = f'''
    <w:tcBorders {nsdecls("w")}>
        <w:top w:val="dashed" w:sz="16" w:space="0" w:color="0284C7"/>
        <w:left w:val="dashed" w:sz="16" w:space="0" w:color="0284C7"/>
        <w:bottom w:val="dashed" w:sz="16" w:space="0" w:color="0284C7"/>
        <w:right w:val="dashed" w:sz="16" w:space="0" w:color="0284C7"/>
    </w:tcBorders>
    '''
    c_ph._tc.get_or_add_tcPr().append(parse_xml(borders_ph))
    
    p_ph = c_ph.paragraphs[0]
    p_ph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_ph1 = p_ph.add_run("📸 [ESPACIO RESERVADO PARA EL DIAGRAMA DE PAQUETES DE MODELIO]\n\n")
    r_ph1.font.bold = True
    r_ph1.font.size = Pt(12)
    r_ph1.font.color.rgb = RGBColor(3, 105, 161)
    
    r_ph2 = p_ph.add_run(
        "Instrucciones para la entrega final:\n"
        "1. En Modelio 5.x, abra el diagrama 'Package Diagram - AeroControl Ops'.\n"
        "2. Vaya a File ➔ Export Diagram ➔ Guardar como PNG / JPG.\n"
        "3. En este documento Word, seleccione este recuadro y pegue (Ctrl + V) la imagen exportada.\n"
        "4. El ancho recomendado es de 16 cm para asegurar perfecta legibilidad en formato A4."
    )
    r_ph2.font.size = Pt(9.5)
    r_ph2.font.color.rgb = RGBColor(100, 116, 139)

    doc.add_paragraph()

    # ==========================================
    # 4. ESTRATEGIA DE PRUEBAS
    # ==========================================
    doc.add_page_break()
    h3 = doc.add_heading("3. Estrategia Inicial de Pruebas", level=1)
    h3.runs[0].font.color.rgb = RGBColor(3, 105, 161)
    h3.runs[0].font.size = Pt(16)

    doc.add_paragraph(
        "La garantía de calidad del software en AeroControl Ops se fundamenta en la Pirámide de Pruebas de Mike Cohn, "
        "estableciendo una base sólida de pruebas unitarias automatizadas, complementada con pruebas funcionales de integración "
        "sobre los endpoints REST, pruebas de aceptación UAT bajo criterios de negocio BDD y auditoría estricta de accesibilidad WCAG 2.1 AA."
    )

    doc.add_heading("3.1 Pruebas Unitarias (Unit Testing)", level=2)
    doc.add_paragraph(
        "Objetivo: Verificar de forma aislada e instantánea la lógica algorítmica y las transformaciones de datos sin depender "
        "de conexiones de red ni de bases de datos. Se utiliza el módulo nativo de Node.js (node:test y node:assert)."
    )

    # Bloque de código unitario
    tbl_code = doc.add_table(rows=1, cols=1)
    tbl_code.alignment = WD_TABLE_ALIGNMENT.CENTER
    c_code = tbl_code.cell(0, 0)
    c_code.width = Inches(6.5)
    set_cell_background(c_code, "0F172A")
    set_cell_margins(c_code, top=140, bottom=140, left=180, right=180)
    
    code_text = """// test/unit_test.mjs - Suite de Pruebas Unitarias Automatizadas
import { test } from "node:test";
import assert from "node:assert/strict";

// 1. Validador de formato aeronáutico IATA/ICAO
function isValidFlightCode(code) {
  return /^[A-Z0-9]{2,3}\\d{3,4}$/.test(code);
}

// 2. Algoritmo euclidiano de proximidad en radar (Canvas 2D)
function checkRadarCollision(p1, p2, minDistance = 50) {
  const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
  return dist < minDistance;
}

test("Validación estricta de códigos IATA (HU-01)", () => {
  assert.equal(isValidFlightCode("LA2045"), true);
  assert.equal(isValidFlightCode("IB6651"), true);
  assert.equal(isValidFlightCode("CODIGO_ERRONEO"), false);
});

test("Detección de proximidad peligrosa en radar de Torre (HU-05)", () => {
  const avionA = { x: 100, y: 150 };
  const avionB = { x: 120, y: 160 }; // Distancia: 22.36 px (< 50 px umbral)
  const avionC = { x: 300, y: 400 };

  assert.equal(checkRadarCollision(avionA, avionB), true, "Alerta de colisión esperada");
  assert.equal(checkRadarCollision(avionA, avionC), false, "Aviones separados sin alerta");
});"""
    p_c = c_code.paragraphs[0]
    r_c = p_c.add_run(code_text)
    r_c.font.name = 'Consolas'
    r_c.font.size = Pt(8.5)
    r_c.font.color.rgb = RGBColor(56, 189, 248)

    doc.add_paragraph()
    doc.add_heading("3.2 Pruebas Funcionales y de Integración (API REST)", level=2)
    doc.add_paragraph(
        "Objetivo: Validar que los endpoints del backend REST respondan fielmente a las reglas de negocio, "
        "preserven la integridad relacional de la base de datos, administren adecuadamente las sesiones y apliquen el control de acceso por roles."
    )

    # Tabla de Pruebas de Integración TC-F01 a TC-F07
    tbl_int = doc.add_table(rows=1, cols=5)
    tbl_int.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(tbl_int, color="CBD5E1")
    
    headers_int = ["ID Caso", "Endpoint / Módulo", "Precondición", "Entrada / Acción", "Resultado Esperado"]
    for i, h in enumerate(headers_int):
        tbl_int.rows[0].cells[i].paragraphs[0].text = h
    format_row(tbl_int.rows[0], "0369A1", is_header=True)

    casos_int = [
        ("TC-F01", "/api/auth/login", "Usuario activo en BD", "POST con DNI 12345678 y clave válida", "HTTP 200, emisión de cookie aerocontrol_session con flags HttpOnly y SameSite=Lax."),
        ("TC-F02", "/api/auth/login", "Usuario existente", "POST con contraseña incorrecta", "HTTP 401 Unauthorized, mensaje 'Credenciales inválidas', sin sesión emitida."),
        ("TC-F03", "/api/vuelos", "Sesión rol Operador", "POST nuevo vuelo LIM-CUZ hora 15:30", "HTTP 201 Created, vuelo almacenado con ID generado e inserción en bitácora."),
        ("TC-F04", "/api/vuelos", "Vuelo LA2099 registrado", "POST duplicado con mismo código", "HTTP 400/409, rechazo por restricción UNIQUE de código de vuelo."),
        ("TC-F05", "/api/solicitudes-operativas", "Vuelo entrante asignado", "POST solicitud rotación para salida", "HTTP 201 Created, estado 'Pendiente' y sincronización hacia Torre de Control."),
        ("TC-F06", "/api/bitacora", "Mutación efectuada", "GET /api/bitacora (Rol Administrador)", "HTTP 200, array JSON registrando acción, DNI del autor y timestamp inmutable."),
        ("TC-F07", "Control de Acceso RBAC", "Sesión rol Operador", "DELETE /api/usuarios/:id", "HTTP 403 Forbidden (el rol Operador no tiene facultades de gestión de cuentas).")
    ]
    for c_data in casos_int:
        row = tbl_int.add_row()
        for idx, text in enumerate(c_data):
            row.cells[idx].paragraphs[0].text = text
        format_row(row, "F8FAFC" if len(tbl_int.rows) % 2 == 0 else "FFFFFF")

    doc.add_paragraph()
    doc.add_heading("3.3 Pruebas de Aceptación (User Acceptance Testing - UAT / BDD)", level=2)
    doc.add_paragraph(
        "Para asegurar que el sistema responda a las expectativas de los operadores aeroportuarios, se formulan "
        "criterios de aceptación bajo el estándar Behavior-Driven Development (Dado - Cuando - Entonces):"
    )

    uat_cases = [
        ("HU-01: Gestión y Monitoreo de Vuelos en Tiempo Real", 
         "Dado que un Operador de Rampa ha iniciado sesión legítimamente en el sistema,\n"
         "Cuando modifica el estado del vuelo LA2045 a 'Retrasado' debido a neblina en cabecera de pista,\n"
         "Entonces el sistema refleja el cambio inmediatamente en la tabla visual, actualiza el indicador a color ámbar y genera un registro auditable en la bitácora."),
        
        ("HU-03: Detección y Prevención de Conflictos de Puerta (Safety Gate)", 
         "Dado que la puerta de embarque G02 se encuentra asignada a un vuelo programado a las 14:00 horas,\n"
         "Cuando un usuario intenta programar otro vuelo en la misma puerta G02 a las 14:05 horas,\n"
         "Entonces el sistema dispara una alerta de bloqueo operacional impidiendo la superposición y sugiriendo una puerta libre inmediata."),
        
        ("HU-05: Autorización de Despegue y Sincronización Torre-Radar", 
         "Dado que existe una solicitud operativa de salida con estatus de confirmación de plan de vuelo,\n"
         "Cuando el controlador de Torre presiona 'Autorizar Salida',\n"
         "Entonces la solicitud pasa a estado 'Aprobada', el simulador Canvas 2D genera dinámicamente la traza de despegue en pista 16L y se notifica al dashboard."),
        
        ("HU-06: Confidencialidad y Control de Acceso Basado en Roles (RBAC)", 
         "Dado que un usuario autenticado consulta cualquier interfaz o endpoint del sistema,\n"
         "Cuando se auditan las respuestas JSON transmitidas por la red,\n"
         "Entonces en ningún caso se expone el hash de la contraseña (password_hash) y la interfaz solo habilita los módulos asignados a su nivel de privilegio.")
    ]

    for tit, desc in uat_cases:
        create_callout(doc, tit, desc, border_color="0369A1", bg_color="F8FAFC")

    doc.add_heading("3.4 Pruebas de Accesibilidad (WCAG 2.1 Nivel AA & ODS 10)", level=2)
    doc.add_paragraph(
        "En concordancia con el Objetivo de Desarrollo Sostenible ODS 10 (Reducción de Desigualdades), AeroControl Ops "
        "garantiza el acceso universal para operadores con capacidades diversas mediante:"
    )
    a11y_points = [
        ("Percepción (WCAG 1.4.3): ", "Contraste cromático mínimo de 4.5:1 para texto estándar y 3.0:1 para componentes de interfaz y etiquetas de estado."),
        ("Operabilidad (WCAG 2.1.1): ", "Navegación 100% ejecutable por teclado utilizando Tab, Shift+Tab, Enter y Escape, con contorno visual focal evidente (:focus-visible)."),
        ("Comprensión (WCAG 3.3.2): ", "Etiquetado semántico explícito en todos los campos de formulario (<label for='...'>) y mensajes de error descriptivos."),
        ("Robustez (WCAG 4.1.2 / 4.1.3): ", "Implementación de roles semánticos WAI-ARIA (role='dialog', aria-modal='true') y regiones dinámicas aria-live='polite' para notificaciones.")
    ]
    for tit, desc in a11y_points:
        p_a = doc.add_paragraph(style='List Bullet')
        p_a.add_run(tit).font.bold = True
        p_a.add_run(desc).font.color.rgb = RGBColor(71, 85, 105)

    # ==========================================
    # 5. MÉTRICAS ISO 25010
    # ==========================================
    doc.add_page_break()
    h4 = doc.add_heading("4. Matriz de Métricas de Calidad del Software (ISO/IEC 25010)", level=1)
    h4.runs[0].font.color.rgb = RGBColor(3, 105, 161)
    h4.runs[0].font.size = Pt(16)

    doc.add_paragraph(
        "Para evaluar cuantitativamente el producto y sustentar su madurez técnica durante la práctica de campo, "
        "se establece la siguiente matriz de métricas basada en las características del estándar ISO/IEC 25010:2023:"
    )

    tbl_iso = doc.add_table(rows=1, cols=5)
    tbl_iso.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(tbl_iso, color="CBD5E1")
    
    headers_iso = ["Característica ISO", "Métrica Cuantitativa", "Fórmula / Método de Cálculo", "Umbral / Meta", "Herramienta"]
    for i, h in enumerate(headers_iso):
        tbl_iso.rows[0].cells[i].paragraphs[0].text = h
    format_row(tbl_iso.rows[0], "0369A1", is_header=True)

    metricas_iso = [
        ("Fiabilidad / Pruebas", "Cobertura de Código (Code Coverage)", "(Líneas ejecutadas / Total líneas) * 100", "≥ 80%", "Node.js Test / c8"),
        ("Fiabilidad / Funcional", "Tasa de Éxito de Pruebas (Pass Rate)", "(Casos exitosos / Casos ejecutados) * 100", "100% (Regresión)", "verify_user_stories.mjs"),
        ("Mantenibilidad", "Densidad de Defectos (Defect Density)", "Defectos reportados / (KLOC)", "< 0.5 def/KLOC", "Registro de Auditoría"),
        ("Rendimiento", "Latencia Media de la API REST", "Tiempo transcurrido entre request y response", "≤ 200 ms (P95)", "Network / performance.now()"),
        ("Usabilidad / A11Y", "Puntaje de Accesibilidad Lighthouse", "Ponderación algorítmica WCAG 2.1 AA", "≥ 90 / 100 pts", "Google Lighthouse"),
        ("Seguridad", "Trazabilidad de Mutaciones (No Repudio)", "(Operaciones en bitácora / Mutaciones totales) * 100", "100%", "Tabla bitacora SQL"),
        ("Seguridad", "Inmunidad a Inyección SQL", "(Consultas con Prepared Statements / Total) * 100", "100%", "Análisis Estático de Código")
    ]
    for m_data in metricas_iso:
        row = tbl_iso.add_row()
        for idx, text in enumerate(m_data):
            row.cells[idx].paragraphs[0].text = text
        format_row(row, "F8FAFC" if len(tbl_iso.rows) % 2 == 0 else "FFFFFF")

    doc.add_paragraph()
    doc.add_heading("5. Conclusiones y Referencias Académicas", level=1)
    doc.paragraphs[-1].runs[0].font.color.rgb = RGBColor(3, 105, 161)
    
    conclusiones = [
        ("Separación de Responsabilidades: ", "La arquitectura modular en capas y su correspondiente modelado en Modelio garantizan alta cohesión y bajo acoplamiento entre la interfaz gráfica y los motores de persistencia."),
        ("Garantía de Calidad Multinivel: ", "La integración de pruebas unitarias, verificación automatizada de endpoints y validación de accesibilidad asegura la estabilidad requerida en entornos aeronáuticos de misión crítica."),
        ("Conformidad Normativa: ", "El proyecto satisface plenamente las exigencias metodológicas de la Práctica de Campo, alineándose con las directrices de ISO/IEC 25010:2023, IEEE 29148 y WCAG 2.1 AA.")
    ]
    for tit, desc in conclusiones:
        p_c = doc.add_paragraph(style='List Bullet')
        p_c.add_run(tit).font.bold = True
        p_c.add_run(desc).font.color.rgb = RGBColor(71, 85, 105)

    doc.add_heading("Referencias Bibliográficas", level=2)
    refs = [
        "ISO/IEC. (2023). Systems and software engineering — Systems and software Quality Requirements and Evaluation (SQuaRE) — System and software quality models (ISO/IEC 25010:2023).",
        "IEEE. (2018). ISO/IEC/IEEE International Standard - Systems and software engineering -- Life cycle processes -- Requirements engineering (IEEE Std 29148-2018).",
        "Object Management Group (OMG). (2017). Unified Modeling Language (OMG UML) Version 2.5.1 Specification.",
        "W3C. (2018). Web Content Accessibility Guidelines (WCAG) 2.1. W3C Recommendation.",
        "Cohn, M. (2009). Succeeding with Agile: Software Development Using Scrum. Addison-Wesley Professional."
    ]
    for r in refs:
        p_r = doc.add_paragraph(style='List Bullet')
        r_run = p_r.add_run(r)
        r_run.font.size = Pt(9)
        r_run.font.color.rgb = RGBColor(100, 116, 139)

    # Guardar documento
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    doc.save(output_path)
    print(f"Documento guardado exitosamente en: {output_path}")

if __name__ == "__main__":
    out_file = r"C:\Users\USER\aerocontrol-ops-fullstack\docs\informe\Practica_Campo_Diagrama_Paquetes_y_Pruebas_AeroControl.docx"
    build_document(out_file)
