/**
 * ColumnTypes
 * -----------------------------------------------------------------------
 * Declarative geometry schema per column shape. The properties panel and
 * (in Phase 4) the SVG drawing engine both read this registry instead of
 * hardcoding "if type === 'square'" branches everywhere — adding a new
 * shape later means adding one entry here, not touching UI code.
 *
 * Each field: { key, label, unit, default, min, step }
 */
(function (global) {
  'use strict';

  const mm = 'mm';

  const ColumnTypes = {
    square: {
      label: 'Square',
      fields: [
        { key: 'side', label: 'Side (D)', unit: mm, default: 450, min: 150, step: 5 },
      ],
    },
    rectangle: {
      label: 'Rectangle',
      fields: [
        { key: 'length', label: 'Length (D)', unit: mm, default: 600, min: 150, step: 5 },
        { key: 'width', label: 'Width (B)', unit: mm, default: 300, min: 150, step: 5 },
      ],
    },
    circular: {
      label: 'Circular',
      fields: [
        { key: 'diameter', label: 'Diameter', unit: mm, default: 450, min: 150, step: 5 },
      ],
    },
    polygon: {
      label: 'Polygon',
      fields: [
        { key: 'sides', label: 'No. of Sides', unit: '', default: 6, min: 3, step: 1 },
        { key: 'circumDiameter', label: 'Circumscribed Dia.', unit: mm, default: 500, min: 150, step: 5 },
      ],
    },
    lshape: {
      label: 'L-Shape',
      fields: [
        { key: 'length', label: 'Overall Length (D)', unit: mm, default: 600, min: 150, step: 5 },
        { key: 'width', label: 'Overall Width (B)', unit: mm, default: 600, min: 150, step: 5 },
        { key: 'flangeThk1', label: 'Limb Thickness 1', unit: mm, default: 250, min: 100, step: 5 },
        { key: 'flangeThk2', label: 'Limb Thickness 2', unit: mm, default: 250, min: 100, step: 5 },
      ],
    },
    tshape: {
      label: 'T-Shape',
      fields: [
        { key: 'length', label: 'Overall Length (D)', unit: mm, default: 600, min: 150, step: 5 },
        { key: 'width', label: 'Overall Width (B)', unit: mm, default: 600, min: 150, step: 5 },
        { key: 'flangeThk', label: 'Flange Thickness', unit: mm, default: 200, min: 100, step: 5 },
        { key: 'webThk', label: 'Web Thickness', unit: mm, default: 250, min: 100, step: 5 },
      ],
    },
    custom: {
      label: 'Custom Shape',
      fields: [
        { key: 'boundingLength', label: 'Bounding Length', unit: mm, default: 600, min: 150, step: 5 },
        { key: 'boundingWidth', label: 'Bounding Width', unit: mm, default: 600, min: 150, step: 5 },
      ],
      note: 'Vertex-by-vertex custom outline editing arrives with the drawing engine (Phase 4).',
    },
  };

  // Fields common to every column, regardless of shape.
  const COMMON_FIELDS = [
    { key: 'height', label: 'Clear Height', unit: mm, default: 3000, min: 300, step: 10 },
    { key: 'floorHeight', label: 'Floor-to-Floor Height', unit: mm, default: 3200, min: 300, step: 10 },
    { key: 'clearCover', label: 'Clear Cover', unit: mm, default: 40, min: 15, step: 1 },
  ];

  const CONCRETE_GRADES = ['M20', 'M25', 'M30', 'M35', 'M40', 'M45', 'M50'];
  const STEEL_GRADES = ['Fe415', 'Fe500', 'Fe500D', 'Fe550'];
  const DESIGN_CODES = ['IS 456 : 2000', 'IS 13920 : 2016', 'ACI 318', 'Eurocode 2', 'BS 8110'];
  const BAR_DIAMETERS = [8, 10, 12, 16, 20, 25, 28, 32, 36, 40];

  global.App = global.App || {};
  global.App.ColumnTypes = ColumnTypes;
  global.App.COMMON_FIELDS = COMMON_FIELDS;
  global.App.CONCRETE_GRADES = CONCRETE_GRADES;
  global.App.STEEL_GRADES = STEEL_GRADES;
  global.App.DESIGN_CODES = DESIGN_CODES;
  global.App.BAR_DIAMETERS = BAR_DIAMETERS;
})(window);
