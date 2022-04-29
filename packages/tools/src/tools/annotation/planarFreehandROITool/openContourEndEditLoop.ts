import { getEnabledElement } from '@cornerstonejs/core';
import { state } from '../../../store';
import { Events } from '../../../enums';
import { hideElementCursor } from '../../../cursors/elementCursor';
import { EventTypes } from '../../../types';
import { polyline } from '../../../utilities/math';

const { getSpacingAndXYDirections } = polyline;

/**
 * Activates the open contour end edit. This actually just sets up the state so
 * that the tool thinks we are mid draw, and then jumps into the drawing loop.
 */
function activateOpenContourEndEdit(
  evt: EventTypes.MouseDownActivateEventType,
  annotation: Types.Annotation,
  viewportIdsToRender: string[]
): void {
  this.isDrawing = true;

  const eventDetail = evt.detail;
  const { element } = eventDetail;
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;

  const { spacing, xDir, yDir } = getSpacingAndXYDirections(
    viewport,
    this.configuration.subPixelResolution
  );

  const canvasPoints = annotation.data.polyline.map(viewport.worldToCanvas);
  const handleIndexGrabbed = annotation.data.handles.activeHandleIndex;

  // If 0, invert point direction, if 1, keep point direction the same.
  // This is so we can just jump as into the state as if the annotation was just being drawn.
  if (handleIndexGrabbed === 0) {
    canvasPoints.reverse();
  }

  this.drawData = {
    canvasPoints: canvasPoints,
    polylineIndex: canvasPoints.length - 1,
  };

  this.commonData = {
    annotation,
    viewportIdsToRender,
    spacing,
    xDir,
    yDir,
  };

  state.isInteractingWithTool = true;

  // Jump into drawing loop.
  element.addEventListener(Events.MOUSE_UP, this.mouseUpDrawCallback);
  element.addEventListener(Events.MOUSE_DRAG, this.mouseDragDrawCallback);
  element.addEventListener(Events.MOUSE_CLICK, this.mouseUpDrawCallback);

  hideElementCursor(element);
}

/**
 * Registers the open contour end edit loop to the tool instance.
 */
function registerOpenContourEndEditLoop(toolInstance) {
  toolInstance.activateOpenContourEndEdit =
    activateOpenContourEndEdit.bind(toolInstance);
}

export default registerOpenContourEndEditLoop;
