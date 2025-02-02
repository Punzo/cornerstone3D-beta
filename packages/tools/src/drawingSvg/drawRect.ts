import type { Types } from '@cornerstonejs/core';

import _getHash from './_getHash';
import _setAttributesIfNecessary from './_setAttributesIfNecessary';
import _setNewAttributesIfValid from './_setNewAttributesIfValid';

// <rect x="120" y="100" width="100" height="100" />
export default function drawRect(
  svgDrawingHelper: any,
  annotationUID: string,
  rectangleUID: string,
  start: Types.Point2,
  end: Types.Point2,
  options = {}
): void {
  const {
    color,
    width: _width,
    lineWidth,
    lineDash,
  } = Object.assign(
    {
      color: 'dodgerblue',
      width: '2',
      lineWidth: undefined,
      lineDash: undefined,
    },
    options
  );

  // for supporting both lineWidth and width options
  const strokeWidth = lineWidth || _width;

  const svgns = 'http://www.w3.org/2000/svg';
  const svgNodeHash = _getHash(annotationUID, 'rect', rectangleUID);
  const existingRect = svgDrawingHelper._getSvgNode(svgNodeHash);

  const tlhc = [Math.min(start[0], end[0]), Math.min(start[1], end[1])];
  const width = Math.abs(start[0] - end[0]);
  const height = Math.abs(start[1] - end[1]);

  const attributes = {
    x: `${tlhc[0]}`,
    y: `${tlhc[1]}`,
    width: `${width}`,
    height: `${height}`,
    stroke: color,
    fill: 'transparent',
    'stroke-width': strokeWidth,
    'stroke-dasharray': lineDash,
  };

  if (existingRect) {
    _setAttributesIfNecessary(attributes, existingRect);

    svgDrawingHelper._setNodeTouched(svgNodeHash);
  } else {
    const svgRectElement = document.createElementNS(svgns, 'rect');

    _setNewAttributesIfValid(attributes, svgRectElement);

    svgDrawingHelper._appendNode(svgRectElement, svgNodeHash);
  }
}
