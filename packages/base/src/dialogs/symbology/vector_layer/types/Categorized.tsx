import { IVectorLayer } from '@jupytergis/schema';
import { ReadonlyJSONObject } from '@lumino/coreutils';
import { ExpressionValue } from 'ol/expr/expression';
import React, { useEffect, useRef, useState } from 'react';

import ColorRamp from '@/src/dialogs/symbology/components/color_ramp/ColorRamp';
import StopContainer from '@/src/dialogs/symbology/components/color_stops/StopContainer';
import { useGetProperties } from '@/src/dialogs/symbology/hooks/useGetProperties';
import {
  IStopRow,
  ISymbologyTabbedDialogProps,
} from '@/src/dialogs/symbology/symbologyDialog';
import { Utils, VectorUtils } from '@/src/dialogs/symbology/symbologyUtils';
import ValueSelect from '@/src/dialogs/symbology/vector_layer/components/ValueSelect';
import { getNumericFeatureAttributes } from '@/src/tools';
import { SymbologyTab } from '@/src/types';

const Categorized = ({
  model,
  state,
  okSignalPromise,
  cancel,
  layerId,
  symbologyTab,
}: ISymbologyTabbedDialogProps) => {
  const selectedValueRef = useRef<string>();
  const stopRowsRef = useRef<IStopRow[]>();
  const colorRampOptionsRef = useRef<ReadonlyJSONObject | undefined>();

  const [selectedValue, setSelectedValue] = useState('');
  const [stopRows, setStopRows] = useState<IStopRow[]>([]);
  const [colorRampOptions, setColorRampOptions] = useState<
    ReadonlyJSONObject | undefined
  >();
  const [features, setFeatures] = useState<Record<string, Set<number>>>({});
  const [manualStyle, setManualStyle] = useState({
    fillColor: '#3399CC',
    strokeColor: '#3399CC',
    strokeWidth: 1.25,
    radius: 5,
  });
  const manualStyleRef = useRef(manualStyle);

  if (!layerId) {
    return;
  }
  const layer = model.getLayer(layerId);
  if (!layer?.parameters) {
    return;
  }
  const { featureProperties } = useGetProperties({
    layerId,
    model: model,
  });

  useEffect(() => {
    const valueColorPairs = VectorUtils.buildColorInfo(layer);

    setStopRows(valueColorPairs);

    okSignalPromise.promise.then(okSignal => {
      okSignal.connect(handleOk, this);
    });

    return () => {
      okSignalPromise.promise.then(okSignal => {
        okSignal.disconnect(handleOk, this);
      });
    };
  }, []);

  useEffect(() => {
    if (layer?.parameters?.color) {
      const fillColor = layer.parameters.color['fill-color'];
      const circleFillColor = layer.parameters.color['circle-fill-color'];
      const strokeColor = layer.parameters.color['stroke-color'];
      const circleStrokeColor = layer.parameters.color['circle-stroke-color'];

      const isSimpleColor = (val: any) =>
        typeof val === 'string' && /^#?[0-9A-Fa-f]{3,8}$/.test(val);

      setManualStyle({
        fillColor: isSimpleColor(fillColor)
          ? fillColor
          : isSimpleColor(circleFillColor)
            ? circleFillColor
            : '#3399CC',

        strokeColor: isSimpleColor(strokeColor)
          ? strokeColor
          : isSimpleColor(circleStrokeColor)
            ? circleStrokeColor
            : '#3399CC',

        strokeWidth:
          layer.parameters.color['stroke-width'] ||
          layer.parameters.color['circle-stroke-width'] ||
          1.25,
        radius: layer.parameters.color['circle-radius'] || 5,
      });
    }
  }, [layerId]);

  useEffect(() => {
    manualStyleRef.current = manualStyle;
  }, [manualStyle]);

  useEffect(() => {
    // We only want number values here
    const numericFeatures = getNumericFeatureAttributes(featureProperties);

    setFeatures(numericFeatures);

    const layerParams = layer.parameters as IVectorLayer;
    const value =
      layerParams.symbologyState?.value ?? Object.keys(numericFeatures)[0];

    setSelectedValue(value);
  }, [featureProperties]);

  useEffect(() => {
    selectedValueRef.current = selectedValue;
    stopRowsRef.current = stopRows;
    colorRampOptionsRef.current = colorRampOptions;
  }, [selectedValue, stopRows, colorRampOptions]);

  const buildColorInfoFromClassification = (
    selectedMode: string,
    numberOfShades: string,
    selectedRamp: string,
    setIsLoading: (isLoading: boolean) => void,
  ) => {
    setColorRampOptions({
      selectedFunction: '',
      selectedRamp,
      numberOfShades: '',
      selectedMode: '',
    });

    const stops = Array.from(features[selectedValue]).sort((a, b) => a - b);

    const valueColorPairs = Utils.getValueColorPairs(
      stops,
      selectedRamp,
      stops.length,
    );

    setStopRows(valueColorPairs);
  };

  const handleOk = () => {
    if (!layer.parameters) {
      return;
    }

    const newStyle = { ...layer.parameters.color };

    if (stopRowsRef.current && stopRowsRef.current.length > 0) {
      // Classification applied (for color)
      const expr: ExpressionValue[] = ['case'];

      stopRowsRef.current.forEach(stop => {
        expr.push(['==', ['get', selectedValueRef.current], stop.stop]);
        expr.push(stop.output);
      });

      if (symbologyTab === 'color') {
        expr.push([0, 0, 0, 0.0]); // fallback color

        newStyle['fill-color'] = expr;
        newStyle['circle-fill-color'] = expr;
        newStyle['stroke-color'] = expr;
        newStyle['circle-stroke-color'] = expr;
      }
    } else {
      newStyle['fill-color'] = manualStyleRef.current.fillColor;
      newStyle['circle-fill-color'] = manualStyleRef.current.fillColor;
    }

    newStyle['stroke-width'] = manualStyleRef.current.strokeWidth;
    newStyle['circle-stroke-width'] = manualStyleRef.current.strokeWidth;
    newStyle['circle-radius'] = manualStyleRef.current.radius;
    newStyle['circle-stroke-color'] = manualStyleRef.current.strokeColor;

    const symbologyState = {
      renderType: 'Categorized',
      value: selectedValueRef.current,
      colorRamp: colorRampOptionsRef.current?.selectedRamp,
      nClasses: colorRampOptionsRef.current?.numberOfShades,
      mode: colorRampOptionsRef.current?.selectedMode,
      symbologyTab,
    };

    layer.parameters.symbologyState = symbologyState;
    layer.parameters.color = newStyle;

    if (layer.type === 'HeatmapLayer') {
      layer.type = 'VectorLayer';
    }

    model.sharedModel.updateLayer(layerId, layer);
    cancel();
  };

  const handleReset = (method: SymbologyTab) => {
    if (!layer?.parameters) {
      return;
    }

    const newStyle = { ...layer.parameters.color };

    if (method === 'color') {
      console.log('delecol');

      delete newStyle['fill-color'];
      delete newStyle['stroke-color'];
      delete newStyle['circle-fill-color'];
      delete newStyle['circle-stroke-color'];
      setStopRows([]);

      // Reset color classification options
      if (layer.parameters.symbologyState) {
        layer.parameters.symbologyState.colorRamp = undefined;
        layer.parameters.symbologyState.nClasses = undefined;
        layer.parameters.symbologyState.mode = undefined;
      }
    }

    if (method === 'radius') {
      delete newStyle['circle-radius'];
    }

    layer.parameters.color = newStyle;

    model.sharedModel.updateLayer(layerId, layer);
  };

  return (
    <div className="jp-gis-layer-symbology-container">
      <ValueSelect
        featureProperties={features}
        selectedValue={selectedValue}
        setSelectedValue={setSelectedValue}
      />

      <div className="jp-gis-layer-symbology-container">
        {/* Inputs depending on active tab */}
        {symbologyTab === 'color' && (
          <>
            <div className="jp-gis-symbology-row">
              <label>Fill Color:</label>
              <input
                type="color"
                className="jp-mod-styled"
                value={manualStyle.fillColor}
                onChange={e => {
                  handleReset('color');
                  setManualStyle(prev => ({
                    ...prev,
                    fillColor: e.target.value,
                  }));
                }}
              />
            </div>
            <div className="jp-gis-symbology-row">
              <label>Stroke Color:</label>
              <input
                type="color"
                className="jp-mod-styled"
                value={manualStyle.strokeColor}
                onChange={e => {
                  setManualStyle(prev => ({
                    ...prev,
                    strokeColor: e.target.value,
                  }));
                }}
              />
            </div>
            <div className="jp-gis-symbology-row">
              <label>Stroke Width:</label>
              <input
                type="number"
                className="jp-mod-styled"
                value={manualStyle.strokeWidth}
                onChange={e => {
                  setManualStyle(prev => ({
                    ...prev,
                    strokeWidth: +e.target.value,
                  }));
                }}
              />
            </div>
          </>
        )}

        {symbologyTab === 'radius' && (
          <div className="jp-gis-symbology-row">
            <label>Circle Radius:</label>
            <input
              type="number"
              className="jp-mod-styled"
              value={manualStyle.radius}
              onChange={e => {
                setManualStyle(prev => ({
                  ...prev,
                  radius: +e.target.value,
                }));
              }}
            />
          </div>
        )}
      </div>

      <div className="jp-gis-layer-symbology-container">
        <ColorRamp
          layerParams={layer.parameters}
          modeOptions={[]}
          classifyFunc={buildColorInfoFromClassification}
          showModeRow={false}
          showRampSelector={symbologyTab === 'color'}
        />
        <StopContainer
          selectedMethod={''}
          stopRows={stopRows}
          setStopRows={setStopRows}
        />
      </div>
    </div>
  );
};

export default Categorized;
