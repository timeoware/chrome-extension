const svgWidth = 480;
let r1 = svgWidth / 2.09;
let r2 = svgWidth / 2.85;
const maxIconWidth = 20;
let textColor = '#030c14';
let upTar = svgWidth / 2;
let bottomTar = svgWidth / 2.115;

const baseCircle = document.createElementNS("http://www.w3.org/2000/svg", 'circle');
baseCircle.setAttribute("cx", svgWidth / 2);
baseCircle.setAttribute("cy", svgWidth / 2);
baseCircle.setAttribute("r", svgWidth / 2);
baseCircle.setAttribute("class", "arcColor");

const centerCircle = document.createElementNS("http://www.w3.org/2000/svg", 'circle');
centerCircle.setAttribute("cx", svgWidth / 2);
centerCircle.setAttribute("cy", svgWidth / 2);
centerCircle.setAttribute("r", r2 * 0.96);
centerCircle.setAttribute("fill", 'white');


