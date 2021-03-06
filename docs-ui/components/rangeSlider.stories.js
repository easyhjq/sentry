import React from 'react';

import RangeSlider from 'app/views/settings/components/forms/controls/rangeSlider';

export default {
  title: 'Core/Forms/Controls',
};

export const _RangeSlider = () => (
  <React.Fragment>
    <p>
      <h4>Without custom input</h4>
      <RangeSlider min={1} max={100} value={5} />
    </p>
    <p>
      <h4>With custom input</h4>
      <RangeSlider min={5} max={50} value={21} showCustomInput />
    </p>
  </React.Fragment>
);

_RangeSlider.storyName = 'RangeSlider';
