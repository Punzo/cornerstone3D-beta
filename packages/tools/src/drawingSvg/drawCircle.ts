import type { Types } from '@cornerstonejs/core';

import _getHash from './_getHash';

import _setAttributesIfNecessary from './_setAttributesIfNecessary';
import _setNewAttributesIfValid from './_setNewAttributesIfValid';

function drawCircle(
  svgDrawingHelper: any,
  annotationUID: string,
  circleUID: string,
  center: Types.Point2,
  radius: number,
  options = {}
): void {
  const { color, fill, width, lineWidth } = Object.assign(
    {
      color: 'dodgerblue',
      fill: 'transparent',
      width: '2',
      lineWidth: undefined,
    },
    options
  );

  // for supporting both lineWidth and width options
  const strokeWidth = lineWidth || width;

  // variable for the namespace
  const svgns = 'http://www.w3.org/2000/svg';
  const svgNodeHash = _getHash(annotationUID, 'circle', circleUID);
  const existingCircleElement = svgDrawingHelper._getSvgNode(svgNodeHash);

  const attributes = {
    cx: `${center[0]}`,
    cy: `${center[1]}`,
    r: `${radius}`,
    stroke: color,
    fill,
    'stroke-width': strokeWidth,
  };

  if (existingCircleElement) {
    _setAttributesIfNecessary(attributes, existingCircleElement);

    svgDrawingHelper._setNodeTouched(svgNodeHash);
  } else {
    const newCircleElement = document.createElementNS(svgns, 'circle');

    _setNewAttributesIfValid(attributes, newCircleElement);

    svgDrawingHelper._appendNode(newCircleElement, svgNodeHash);
  }
}

export default drawCircle;
