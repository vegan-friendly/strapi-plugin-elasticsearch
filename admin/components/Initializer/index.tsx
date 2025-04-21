/**
 *
 * Initializer
 *
 */

import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import pluginId from '../../pluginId';

const Initializer = ({ setPlugin }) => {
  const ref = useRef<Function>();
  ref.current = setPlugin;

  useEffect(() => {
    if (ref.current != null) ref.current(pluginId);
  }, []);

  return null;
};

Initializer.propTypes = {
  setPlugin: PropTypes.func.isRequired,
};

export default Initializer;
