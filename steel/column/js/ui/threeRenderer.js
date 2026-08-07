import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
const DEBUG = true;

function log(...args) {
    // if (DEBUG) console.log("[ThreeRenderer]", ...args);
}

function warn(...args) {
    console.warn("[ThreeRenderer]", ...args);
}

function error(...args) {
    console.error("[ThreeRenderer]", ...args);
}
(function (global) {
"use strict";

/*==========================================================
    Scene Objects
==========================================================*/

let scene = null;
let camera = null;
let renderer = null;
let controls = null;

let container = null;

// Main model container

let columnGroup;
let concreteGroup;
let barGroup;

// Helpers
let gridHelper = null;
let axesHelper = null;

// Lights
let ambientLight = null;
let directionalLight = null;

// Animation
let animationId = null;

// Cached state
let currentColumnId = null;

/*==========================================================
    Public API
==========================================================*/
function inspectScene(){

    log("Objects in Scene:");

    scene.children.forEach((o,i)=>{

        log(i,o.type,o.name);

    });

}
function init() {

    log("Initializing...");
    

    container = document.getElementById("three-stage");

    if (!container){
        error("Container #three-stage not found.");
        return;
    }

    log("Container:", container.clientWidth, "x", container.clientHeight);

    createScene();
    createCamera();
    createRenderer();
    createControls();
    createLights();
    createHelpers();
    inspectScene();

    registerEvents();

    renderColumn();

    animate();

    log("Initialization complete.");
    log("Container Size:", container.clientWidth, container.clientHeight);

}
function resize(){

    if(!renderer) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    // console.log("[ThreeRenderer] Resize",w,h);

    if(w===0 || h===0) return;

    renderer.setSize(w,h);

    camera.aspect=w/h;

    camera.updateProjectionMatrix();

}

function dispose() {

}

function renderColumn(){

    log("Rendering Column...");

    clearColumn();

    const column = App.state.getSelected();

    if(!column){

        warn("No Column Selected");

        return;

    }

    const data = App.Geometry.build3DData(column);

    log(data);

    drawConcrete(data);
    drawBars(data);

}

function clearColumn() {

    while (concreteGroup.children.length) {
        concreteGroup.remove(concreteGroup.children[0]);
    }

    while (barGroup.children.length) {
        barGroup.remove(barGroup.children[0]);
    }

}

/*==========================================================
    Scene Creation
==========================================================*/

function createScene() {

    log("Creating Scene...");

    scene = new THREE.Scene();

    scene.background = new THREE.Color(0x202124);

    // Main column container
    columnGroup = new THREE.Group();
    columnGroup.name = "Column";

    // Concrete
    concreteGroup = new THREE.Group();
    concreteGroup.name = "Concrete";

    // Reinforcement Bars
    barGroup = new THREE.Group();
    barGroup.name = "Bars";

    columnGroup.add(concreteGroup);
    columnGroup.add(barGroup);

    scene.add(columnGroup);

    log("Scene Created.");

}

function createCamera(){

    log("Creating Camera...");

    camera = new THREE.PerspectiveCamera(
        45,
        container.clientWidth / container.clientHeight,
        1,
        50000
    );

    camera.position.set(3000,2500,3000);

    camera.lookAt(0,1000,0);

    log("Camera:", camera.position);

}

function createRenderer(){

    log("Creating Renderer...");

    renderer = new THREE.WebGLRenderer({
        antialias:true
    });

    renderer.setSize(
        container.clientWidth,
        container.clientHeight
    );

    container.innerHTML="";

    container.appendChild(renderer.domElement);

    log("Renderer Created.");

}

function createControls(){

    log("Creating Orbit Controls...");

    controls = new OrbitControls(
        camera,
        renderer.domElement
    );

    controls.enableDamping = true;

    controls.update();

}
function createLights(){

    log("Creating Lights...");

    ambientLight = new THREE.AmbientLight(0xffffff,1.5);

    scene.add(ambientLight);

    directionalLight = new THREE.DirectionalLight(0xffffff,2);

    directionalLight.position.set(
        3000,
        4000,
        3000
    );

    scene.add(directionalLight);

    log("Lights Added.");

}

function createHelpers() {

    log("Creating Helpers...");

    // Grid
    gridHelper = new THREE.GridHelper(
        10000,
        100,
        0x666666,
        0x333333
    );

    scene.add(gridHelper);

    // XYZ Axes
    axesHelper = new THREE.AxesHelper(1000);

    scene.add(axesHelper);

    // ---------- TEMPORARY TEST CUBE ----------
    const cube = new THREE.Mesh(

        new THREE.BoxGeometry(500, 500, 500),

        new THREE.MeshNormalMaterial()

    );

    // // cube.position.set(0, 250, 0);

    // // cube.name = "TestCube";

    // scene.add(cube);

    log("Test cube added.");

    inspectScene();

    log("Helpers Created.");

}
/*==========================================================
    Drawing
==========================================================*/

function drawColumn(data) {

}

function drawConcrete(data) {

    log("Drawing Concrete...");

    let geometry;

    // ---------- Circular ----------
    if (data.outline.isCircle) {

        geometry = new THREE.CylinderGeometry(
            data.outline.circle.r,
            data.outline.circle.r,
            data.height,
            64
        );

        geometry.translate(0, data.height / 2, 0);

    }

    // ---------- Everything Else ----------
    else {

        const shape = new THREE.Shape();

        const verts = data.outline.vertices;

        shape.moveTo(verts[0].x, verts[0].y);

        for (let i = 1; i < verts.length; i++) {

            shape.lineTo(
                verts[i].x,
                verts[i].y
            );

        }

        shape.closePath();

        geometry = new THREE.ExtrudeGeometry(shape, {

            depth: data.height,

            bevelEnabled: false

        });

        // Extrusion goes along Z by default.
        // Rotate so height becomes Y.
        geometry.rotateX(-Math.PI / 2);

    }

    const mesh = new THREE.Mesh(

        geometry,

        concreteMaterial()

    );

    mesh.name = "Concrete";

    concreteGroup.add(mesh);

    log("Concrete Added.");

}
function concreteMaterial(){

    return new THREE.MeshPhysicalMaterial({

        color:0xdadada,

        transparent:true,

        opacity:0.22,

        roughness:0.92,

        metalness:0

    });

}

function drawBars(data) {

    log("Drawing Bars...");

    if (!data.bars || !data.bars.length) {

        warn("No bars found.");

        return;

    }

    const b = data.bars[0];

    log("First Bar:", b);
    console.dir(b);

    const geometry = new THREE.CylinderGeometry(

        b.diameter / 2,

        b.diameter / 2,

        data.height,

        24

    );

    const material = new THREE.MeshPhysicalMaterial({

        color: 0x1565C0,

        metalness: 0.9,

        roughness: 0.2

    });

    const mesh = new THREE.Mesh(
        geometry,
        material
    );

    mesh.rotation.z = Math.PI / 2;

    mesh.position.set(

        b.x,

        data.height / 2,

        b.y

    );

    mesh.name = "Bar-1";

    barGroup.add(mesh);

    log("Bar Added.");

}

function drawStirrups(data) {

}

function drawDimensions(data) {

}

function drawLabels(data) {

}

/*==========================================================
    Shape Builders
==========================================================*/

function buildRectangle(data) {

}

function buildSquare(data) {

}

function buildCircular(data) {

}

function buildPolygon(data) {

}

function buildLShape(data) {

}

function buildTShape(data) {

}

function buildCustom(data) {

}

/*==========================================================
    Reinforcement
==========================================================*/

function createBar(bar,height) {

}

function createTie(level,data) {

}

function createHook(bar) {

}

function createDevelopmentBar(bar) {

}

/*==========================================================
    Materials
==========================================================*/

function concreteMaterial() {

}

function steelMaterial() {

}

function tieMaterial() {

}

function highlightMaterial() {

}

/*==========================================================
    Camera
==========================================================*/

function fitCamera(object) {

}

function resetView() {

}

/*==========================================================
    Animation
==========================================================*/

function animate(){

    animationId=requestAnimationFrame(animate);

    controls.update();

    renderer.render(
        scene,
        camera
    );

}

function onResize() {

}

/*==========================================================
    Utilities
==========================================================*/

function mm(v){

    return v;

}

function centroid(vertices){

}

function createRoundedRectShape(vertices){

}

/*==========================================================
    Events
==========================================================*/

function registerEvents(){

}

/*==========================================================
    Boot
==========================================================*/

document.addEventListener("DOMContentLoaded", init);

global.App = global.App || {};

global.App.ThreeRenderer = {

    init,
    renderColumn,
    resetView,
    resize,

};

})(window);